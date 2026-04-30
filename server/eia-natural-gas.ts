import type { Dataset } from '../src/data'
import { histogram, mean, percentile, round } from './dataset-utils'

type NaturalGasRecord = {
  period: string
  duoarea?: string
  'area-name'?: string
  value: string | number
}

type ParsedNaturalGasRecord = {
  period: string
  code: string
  name: string
  value: number
}

export async function buildEiaNaturalGasDataset(): Promise<Dataset> {
  const apiKey = process.env.EIA_API_KEY

  if (!apiKey) {
    throw new Error('Missing EIA_API_KEY')
  }

  const endpoint = new URL('https://api.eia.gov/v2/natural-gas/pri/sum/data/')
  endpoint.searchParams.set('api_key', apiKey)
  endpoint.searchParams.set('frequency', 'monthly')
  endpoint.searchParams.set('data[0]', 'value')
  endpoint.searchParams.set('facets[process][]', 'PRS')
  endpoint.searchParams.set('sort[0][column]', 'period')
  endpoint.searchParams.set('sort[0][direction]', 'desc')
  endpoint.searchParams.set('offset', '0')
  endpoint.searchParams.set('length', '5000')

  const response = await fetch(endpoint)

  if (!response.ok) {
    throw new Error(`EIA natural gas request failed: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as { response?: { data?: NaturalGasRecord[] } }
  const parsed = parseRecords(payload.response?.data ?? [])

  if (parsed.length === 0) {
    throw new Error('EIA returned no usable residential natural gas records')
  }

  return normalizeNaturalGasDataset(parsed)
}

function normalizeNaturalGasDataset(parsed: ParsedNaturalGasRecord[]): Dataset {
  const latestPeriod = parsed[0].period
  const latestRecords = parsed.filter((record) => record.period === latestPeriod)
  const regions = latestRecords
    .map(({ code, name, value }) => ({ code, name, value: round(value, 2) }))
    .sort((a, b) => b.value - a.value)

  if (regions.length === 0) {
    throw new Error('EIA returned no state-level residential natural gas rows')
  }

  const values = regions.map((region) => region.value)
  const distribution = histogram(values, 10, 2)
  const stats = {
    mean: round(mean(values), 2),
    median: round(percentile(values, 0.5), 2),
    mode: distribution.reduce((best, bin) => (bin.count > best.count ? bin : best), distribution[0]).value,
    p95: round(percentile(values, 0.95), 2),
    p99: round(percentile(values, 0.99), 2),
  }

  return {
    id: 'natgas',
    label: 'Residential Natural Gas',
    unit: '$/MCF',
    precision: 2,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/natural-gas/pri/sum',
    cadence: 'Runtime server cache',
    asOf: `EIA monthly data through ${latestPeriod}; fetched ${new Date().toISOString()}`,
    isLive: true,
    summary:
      'Residential natural gas prices vary sharply by state and season, so national headlines can miss local heating pressure.',
    mostPeople: `Most reported state prices cluster around $${percentile(values, 0.25).toFixed(2)}-$${percentile(values, 0.75).toFixed(2)} per thousand cubic feet.`,
    stats,
    distribution,
    regions,
    trend: buildTrend(parsed),
  }
}

function parseRecords(records: NaturalGasRecord[]): ParsedNaturalGasRecord[] {
  return records
    .map((record) => {
      const code = normalizeCode(record.duoarea)
      return {
        period: record.period,
        code,
        name: normalizeName(code, record['area-name']),
        value: Number(record.value),
      }
    })
    .filter((record) => record.period && /^[A-Z]{2}$/.test(record.code) && Number.isFinite(record.value) && record.value > 0)
}

function normalizeCode(code: string | undefined) {
  return code?.match(/^S([A-Z]{2})$/)?.[1] ?? ''
}

function normalizeName(code: string, name: string | undefined) {
  return name?.replace(/^USA-/, '') ?? code
}

function buildTrend(parsed: ParsedNaturalGasRecord[]) {
  const grouped = new Map<string, number[]>()

  for (const record of parsed) {
    grouped.set(record.period, [...(grouped.get(record.period) ?? []), record.value])
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-12)
    .map(([period, values]) => ({
      month: period,
      mean: round(mean(values), 2),
      median: round(percentile(values, 0.5), 2),
    }))
}
