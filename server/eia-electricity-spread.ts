import type { Dataset } from '../src/data'
import { histogram, mean, percentile, round } from './dataset-utils'

type RetailSalesRecord = {
  period: string
  price: string | number
  sectorid?: string
  stateid?: string
  stateDescription?: string
}

type SpreadRecord = {
  period: string
  code: string
  name: string
  residential: number
  industrial: number
  value: number
}

export async function buildEiaElectricitySpreadDataset(): Promise<Dataset> {
  const apiKey = process.env.EIA_API_KEY

  if (!apiKey) {
    throw new Error('Missing EIA_API_KEY')
  }

  const endpoint = new URL('https://api.eia.gov/v2/electricity/retail-sales/data/')
  endpoint.searchParams.set('api_key', apiKey)
  endpoint.searchParams.set('frequency', 'monthly')
  endpoint.searchParams.set('data[0]', 'price')
  endpoint.searchParams.append('facets[sectorid][]', 'RES')
  endpoint.searchParams.append('facets[sectorid][]', 'IND')
  endpoint.searchParams.set('sort[0][column]', 'period')
  endpoint.searchParams.set('sort[0][direction]', 'desc')
  endpoint.searchParams.set('offset', '0')
  endpoint.searchParams.set('length', '10000')

  const response = await fetch(endpoint)

  if (!response.ok) {
    throw new Error(`EIA electricity spread request failed: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as { response?: { data?: RetailSalesRecord[] } }
  const parsed = parseSpreadRecords(payload.response?.data ?? [])

  if (parsed.length === 0) {
    throw new Error('EIA returned no usable residential-industrial electricity spread records')
  }

  return normalizeSpreadDataset(parsed)
}

function parseSpreadRecords(records: RetailSalesRecord[]): SpreadRecord[] {
  const grouped = new Map<string, { period: string; code: string; name: string; residential?: number; industrial?: number }>()

  for (const record of records) {
    const code = record.stateid?.toUpperCase() ?? ''
    const value = Number(record.price)
    if (!record.period || !/^[A-Z]{2}$/.test(code) || !Number.isFinite(value) || value <= 0) continue

    const key = `${record.period}:${code}`
    const current = grouped.get(key) ?? {
      period: record.period,
      code,
      name: record.stateDescription ?? code,
    }

    if (record.sectorid === 'RES') current.residential = value
    if (record.sectorid === 'IND') current.industrial = value
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .filter((record) => record.residential && record.industrial)
    .map((record) => ({
      period: record.period,
      code: record.code,
      name: record.name,
      residential: record.residential ?? 0,
      industrial: record.industrial ?? 0,
      value: (record.residential ?? 0) - (record.industrial ?? 0),
    }))
}

function normalizeSpreadDataset(parsed: SpreadRecord[]): Dataset {
  const latestPeriod = parsed[0].period
  const latestRecords = parsed.filter((record) => record.period === latestPeriod)
  const regions = latestRecords
    .map(({ code, name, value }) => ({ code, name, value: round(value, 1) }))
    .sort((a, b) => b.value - a.value)

  if (regions.length === 0) {
    throw new Error('EIA returned no state-level electricity spread rows')
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
    id: 'elecspread',
    label: 'Home vs. Industrial Power Gap',
    unit: 'c/kWh',
    precision: 1,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/electricity/retail-sales',
    cadence: 'Runtime server cache',
    asOf: `EIA monthly retail sales data through ${latestPeriod}; fetched ${new Date().toISOString()}`,
    isLive: true,
    summary:
      'Electricity headlines often say “power prices” as if every customer pays the same; this shows how much more residential customers pay than industrial customers by state.',
    mostPeople: `Most state residential-industrial gaps cluster around ${percentile(values, 0.25).toFixed(1)}-${percentile(values, 0.75).toFixed(1)} cents per kWh.`,
    stats,
    distribution,
    regions,
    trend: buildTrend(parsed),
  }
}

function buildTrend(parsed: SpreadRecord[]) {
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
