import type { DistributionBin } from '../src/data'

export type SourceBin = {
  label: string
  low: number
  high: number
  count: number
}

export function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

export function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * quantile
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

export function weightedMean(bins: SourceBin[]) {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0)
  const weighted = bins.reduce((sum, bin) => sum + midpoint(bin) * bin.count, 0)
  return weighted / Math.max(total, 1)
}

export function weightedPercentile(bins: SourceBin[], quantile: number) {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0)
  const target = total * quantile
  let seen = 0

  for (const bin of bins) {
    const next = seen + bin.count
    if (target <= next) {
      const local = bin.count <= 0 ? 0 : (target - seen) / bin.count
      return bin.low + (bin.high - bin.low) * Math.max(0, Math.min(1, local))
    }
    seen = next
  }

  return bins.at(-1)?.high ?? 0
}

export function weightedMode(bins: SourceBin[]) {
  const modal = bins.reduce((best, bin) => (bin.count > best.count ? bin : best), bins[0])
  return midpoint(modal)
}

export function sourceBinsToDistribution(bins: SourceBin[]): DistributionBin[] {
  return bins.map((bin) => ({
    label: bin.label,
    value: midpoint(bin),
    count: bin.count,
  }))
}

export function histogram(values: number[], size: number, precision: number) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 0.1)
  const step = span / size

  return Array.from({ length: size }, (_, index) => {
    const start = min + index * step
    const end = index === size - 1 ? max + 0.001 : start + step
    const value = round(start + step / 2, precision)
    return {
      label: compactNumber(value),
      value,
      count: values.filter((item) => item >= start && item < end).length,
    }
  })
}

export function compactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${round(value / 1_000_000, 1)}m`
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

export function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function midpoint(bin: SourceBin) {
  return bin.low + (bin.high - bin.low) / 2
}
