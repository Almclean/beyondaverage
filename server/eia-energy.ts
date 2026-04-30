import type { Dataset } from '../src/data'
import { histogram, mean, percentile, round } from './dataset-utils'

type EiaEnergyRecord = {
  period: string
  price: string | number
  stateid?: string
  stateDescription?: string
}

type ParsedEnergyRecord = {
  period: string
  code: string
  name: string
  value: number
}

export async function buildEiaEnergyDataset(): Promise<Dataset> {
  const apiKey = process.env.EIA_API_KEY

  if (!apiKey) {
    throw new Error('Missing EIA_API_KEY')
  }

  const endpoint = new URL('https://api.eia.gov/v2/electricity/retail-sales/data/')
  endpoint.searchParams.set('api_key', apiKey)
  endpoint.searchParams.set('frequency', 'monthly')
  endpoint.searchParams.set('data[0]', 'price')
  endpoint.searchParams.set('facets[sectorid][]', 'RES')
  endpoint.searchParams.set('sort[0][column]', 'period')
  endpoint.searchParams.set('sort[0][direction]', 'desc')
  endpoint.searchParams.set('offset', '0')
  endpoint.searchParams.set('length', '5000')

  const response = await fetch(endpoint)

  if (!response.ok) {
    throw new Error(`EIA electricity request failed: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as { response?: { data?: EiaEnergyRecord[] } }
  const parsed = parseRecords(payload.response?.data ?? [])

  if (parsed.length === 0) {
    throw new Error('EIA returned no usable residential electricity records')
  }

  return normalizeEnergyDataset(parsed)
}

function normalizeEnergyDataset(parsed: ParsedEnergyRecord[]): Dataset {
  const latestPeriod = parsed[0].period
  const latestRecords = parsed.filter((record) => record.period === latestPeriod)
  const regions = latestRecords
    .map(({ code, name, value }) => ({ code, name, value: round(value, 1) }))
    .sort((a, b) => b.value - a.value)

  if (regions.length === 0) {
    throw new Error('EIA returned no state-level residential electricity rows')
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
    id: 'energy',
    label: 'Residential Energy',
    unit: 'c/kWh',
    precision: 1,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/electricity/retail-sales',
    cadence: 'Runtime server cache',
    asOf: `EIA monthly data through ${latestPeriod}; fetched ${new Date().toISOString()}`,
    isLive: true,
    summary:
      'Residential electricity rates vary sharply by state, making median and percentile views useful for normal bill pressure.',
    mostPeople: `Most reported state rates cluster around ${percentile(values, 0.25).toFixed(1)}-${percentile(values, 0.75).toFixed(1)} cents per kWh.`,
    stats,
    distribution,
    regions,
    trend: buildTrend(parsed),
  }
}

function parseRecords(records: EiaEnergyRecord[]): ParsedEnergyRecord[] {
  return records
    .map((record) => ({
      period: record.period,
      code: record.stateid?.toUpperCase() ?? '',
      name: record.stateDescription ?? record.stateid ?? 'Unknown state',
      value: Number(record.price),
    }))
    .filter((record) => record.period && /^[A-Z]{2}$/.test(record.code) && Number.isFinite(record.value) && record.value > 0)
}

function buildTrend(parsed: ParsedEnergyRecord[]) {
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
