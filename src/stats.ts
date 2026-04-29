import type { Dataset, DistributionBin } from './data'

export type WeightedSample = {
  value: number
  weight: number
}

export type DensityPoint = {
  value: number
  density: number
}

export type BoxSummary = {
  min: number
  q1: number
  median: number
  q3: number
  max: number
}

export function weightedSamples(bins: DistributionBin[]): WeightedSample[] {
  return bins.map((bin) => ({ value: bin.value, weight: bin.count }))
}

export function weightedQuantile(samples: WeightedSample[], quantile: number) {
  const sorted = [...samples].sort((a, b) => a.value - b.value)
  const total = sorted.reduce((sum, sample) => sum + sample.weight, 0)
  const target = total * quantile
  let cumulative = 0

  for (const sample of sorted) {
    cumulative += sample.weight
    if (cumulative >= target) return sample.value
  }

  return sorted.at(-1)?.value ?? 0
}

export function boxSummary(dataset: Dataset): BoxSummary {
  const samples = weightedSamples(dataset.distribution)

  return {
    min: dataset.distribution[0]?.value ?? 0,
    q1: weightedQuantile(samples, 0.25),
    median: dataset.stats.median,
    q3: weightedQuantile(samples, 0.75),
    max: dataset.stats.p99,
  }
}

export function densityCurve(dataset: Dataset, steps = 80): DensityPoint[] {
  const samples = weightedSamples(dataset.distribution)
  const min = dataset.distribution[0]?.value ?? 0
  const max = Math.max(dataset.stats.p99, dataset.distribution.at(-1)?.value ?? min)
  const span = Math.max(max - min, 1)
  const bandwidth = span / 8
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0)

  return Array.from({ length: steps }, (_, index) => {
    const value = min + (span * index) / (steps - 1)
    const density =
      samples.reduce((sum, sample) => {
        const z = (value - sample.value) / bandwidth
        return sum + sample.weight * Math.exp(-0.5 * z * z)
      }, 0) / totalWeight

    return { value, density }
  })
}

export function distributionSummary(dataset: Dataset) {
  const highEndGap = dataset.stats.p99 / dataset.stats.median
  const meanGap = dataset.stats.mean - dataset.stats.median

  return `${dataset.label} distribution. Median ${dataset.stats.median}, mean ${dataset.stats.mean}, p95 ${dataset.stats.p95}, p99 ${dataset.stats.p99}. The mean is ${meanGap >= 0 ? 'above' : 'below'} the median, and p99 is ${highEndGap.toFixed(2)} times the median.`
}
