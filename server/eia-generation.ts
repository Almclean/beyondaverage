import type { Dataset } from '../src/data'
import { histogram, mean, percentile, round } from './dataset-utils'

type GenerationRecord = {
  period: string
  location?: string
  stateDescription?: string
  fueltypeid?: string
  generation: string | number
}

type GenerationShareRecord = {
  period: string
  code: string
  name: string
  value: number
}

export async function buildEiaGenerationDataset(): Promise<Dataset> {
  return buildEiaGenerationShareDataset({
    id: 'generation',
    label: 'Renewable Grid Share',
    fueltypeid: 'AOR',
    fuelLabel: 'renewable',
    summary:
      'State grid mix varies widely, so national generation-share headlines can hide what local electricity actually uses.',
  })
}

export async function buildEiaFossilGenerationDataset(): Promise<Dataset> {
  return buildEiaGenerationShareDataset({
    id: 'fossilgrid',
    label: 'Fossil Grid Share',
    fueltypeid: 'FOS',
    fuelLabel: 'fossil fuel',
    summary:
      'National clean-grid or fossil-grid claims can hide how differently each state still generates electricity.',
  })
}

async function buildEiaGenerationShareDataset(config: {
  id: string
  label: string
  fueltypeid: string
  fuelLabel: string
  summary: string
}): Promise<Dataset> {
  const apiKey = process.env.EIA_API_KEY

  if (!apiKey) {
    throw new Error('Missing EIA_API_KEY')
  }

  const endpoint = new URL('https://api.eia.gov/v2/electricity/electric-power-operational-data/data/')
  endpoint.searchParams.set('api_key', apiKey)
  endpoint.searchParams.set('frequency', 'monthly')
  endpoint.searchParams.set('data[0]', 'generation')
  endpoint.searchParams.append('facets[fueltypeid][]', 'ALL')
  endpoint.searchParams.append('facets[fueltypeid][]', config.fueltypeid)
  endpoint.searchParams.set('facets[sectorid][]', '99')
  endpoint.searchParams.set('sort[0][column]', 'period')
  endpoint.searchParams.set('sort[0][direction]', 'desc')
  endpoint.searchParams.set('offset', '0')
  endpoint.searchParams.set('length', '10000')

  const response = await fetch(endpoint)

  if (!response.ok) {
    throw new Error(`EIA generation request failed: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as { response?: { data?: GenerationRecord[] } }
  const parsed = parseShareRecords(payload.response?.data ?? [], config.fueltypeid)

  if (parsed.length === 0) {
    throw new Error(`EIA returned no usable ${config.fuelLabel} generation mix records`)
  }

  return normalizeGenerationDataset(parsed, config)
}

function normalizeGenerationDataset(
  parsed: GenerationShareRecord[],
  config: { id: string; label: string; fuelLabel: string; summary: string },
): Dataset {
  const latestPeriod = parsed[0].period
  const latestRecords = parsed.filter((record) => record.period === latestPeriod)
  const regions = latestRecords
    .map(({ code, name, value }) => ({ code, name, value: round(value, 1) }))
    .sort((a, b) => b.value - a.value)

  if (regions.length === 0) {
    throw new Error(`EIA returned no state-level ${config.fuelLabel} share records`)
  }

  const values = regions.map((region) => region.value)
  const distribution = histogram(values, 10, 1)
  const stats = {
    mean: round(mean(values), 1),
    median: round(percentile(values, 0.5), 1),
    mode: distribution.reduce((best, bin) => (bin.count > best.count ? bin : best), distribution[0]).value,
    p95: round(percentile(values, 0.95), 1),
    p99: round(percentile(values, 0.99), 1),
  }

  return {
    id: config.id,
    label: config.label,
    unit: '%',
    precision: 1,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/electricity/electric-power-operational-data',
    cadence: 'Runtime server cache',
    asOf: `EIA monthly generation data through ${latestPeriod}; fetched ${new Date().toISOString()}`,
    isLive: true,
    summary: config.summary,
    mostPeople: `Most state ${config.fuelLabel} shares cluster around ${percentile(values, 0.25).toFixed(1)}%-${percentile(values, 0.75).toFixed(1)}% of generation.`,
    stats,
    distribution,
    regions,
    trend: buildTrend(parsed),
  }
}

function parseShareRecords(records: GenerationRecord[], fueltypeid: string): GenerationShareRecord[] {
  const grouped = new Map<string, { period: string; code: string; name: string; all?: number; selected?: number }>()

  for (const record of records) {
    const code = record.location?.toUpperCase() ?? ''
    if (!record.period || !/^[A-Z]{2}$/.test(code)) continue
    const key = `${record.period}:${code}`
    const current = grouped.get(key) ?? {
      period: record.period,
      code,
      name: record.stateDescription ?? code,
    }
    const value = Number(record.generation)
    if (!Number.isFinite(value) || value <= 0) continue
    if (record.fueltypeid === 'ALL') current.all = value
    if (record.fueltypeid === fueltypeid) current.selected = value
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .filter((record) => record.all && record.selected)
    .map((record) => ({
      period: record.period,
      code: record.code,
      name: record.name,
      value: ((record.selected ?? 0) / Math.max(record.all ?? 0, 0.01)) * 100,
    }))
}

function buildTrend(parsed: GenerationShareRecord[]) {
  const grouped = new Map<string, number[]>()

  for (const record of parsed) {
    grouped.set(record.period, [...(grouped.get(record.period) ?? []), record.value])
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-12)
    .map(([period, values]) => ({
      month: period,
      mean: round(mean(values), 1),
      median: round(percentile(values, 0.5), 1),
    }))
}
