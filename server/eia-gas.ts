import type { Dataset } from '../src/data'
import { histogram, mean, percentile, round } from './dataset-utils'

type EiaRecord = {
  period: string
  value: string | number
  duoarea?: string
  'duoarea-name'?: string
}

type ParsedRecord = {
  period: string
  code: string
  name: string
  kind: 'national' | 'state' | 'other'
  value: number
}

const stateNames: Record<string, string> = {
  CA: 'California',
  CO: 'Colorado',
  FL: 'Florida',
  MA: 'Massachusetts',
  MN: 'Minnesota',
  NY: 'New York',
  OH: 'Ohio',
  TX: 'Texas',
  WA: 'Washington',
}

const areaNames: Record<string, string> = {
  R10: 'East Coast',
  R1X: 'New England',
  R1Y: 'Central Atlantic',
  R1Z: 'Lower Atlantic',
  R20: 'Midwest',
  R30: 'Gulf Coast',
  R40: 'Rocky Mountain',
  R50: 'West Coast',
  R5XCA: 'West Coast excluding California',
}

export async function buildEiaGasDataset(): Promise<Dataset> {
  return buildEiaPetroleumPriceDataset({
    id: 'gas',
    label: 'Retail Gasoline',
    product: 'EPM0',
    productLabel: 'retail gasoline',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/gnd',
  })
}

export async function buildEiaDieselDataset(): Promise<Dataset> {
  return buildEiaPetroleumPriceDataset({
    id: 'diesel',
    label: 'Diesel Prices',
    product: 'EPD2D',
    productLabel: 'diesel',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/gnd',
  })
}

async function buildEiaPetroleumPriceDataset(config: {
  id: string
  label: string
  product: string
  productLabel: string
  sourceUrl: string
}): Promise<Dataset> {
  const apiKey = process.env.EIA_API_KEY

  if (!apiKey) {
    throw new Error('Missing EIA_API_KEY')
  }

  const endpoint = new URL('https://api.eia.gov/v2/petroleum/pri/gnd/data/')
  endpoint.searchParams.set('api_key', apiKey)
  endpoint.searchParams.set('frequency', 'weekly')
  endpoint.searchParams.set('data[0]', 'value')
  endpoint.searchParams.set('facets[product][]', config.product)
  endpoint.searchParams.set('sort[0][column]', 'period')
  endpoint.searchParams.set('sort[0][direction]', 'desc')
  endpoint.searchParams.set('offset', '0')
  endpoint.searchParams.set('length', '5000')

  const response = await fetch(endpoint)

  if (!response.ok) {
    throw new Error(`EIA request failed: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as { response?: { data?: EiaRecord[] } }
  const parsed = parseRecords(payload.response?.data ?? [])

  if (parsed.length === 0) {
    throw new Error(`EIA returned no usable ${config.productLabel} records`)
  }

  return normalizePetroleumDataset(parsed, config)
}

export function normalizeGasDataset(parsed: ParsedRecord[]): Dataset {
  return normalizePetroleumDataset(parsed, {
    id: 'gas',
    label: 'Retail Gasoline',
    product: 'EPM0',
    productLabel: 'retail gasoline',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/gnd',
  })
}

function normalizePetroleumDataset(
  parsed: ParsedRecord[],
  config: { id: string; label: string; productLabel: string; sourceUrl: string },
): Dataset {
  const latestPeriod = parsed[0].period
  const latestRecords = parsed.filter((record) => record.period === latestPeriod)
  const stateRecords = latestRecords.filter((record) => record.kind === 'state')
  const areaRecords = latestRecords.filter((record) => record.kind === 'other')
  const regions = stateRecords
    .map(({ code, name, value }) => ({ code, name, value }))
    .sort((a, b) => b.value - a.value)
  const areas = areaRecords
    .map(({ code, name, value }) => ({ code, name, value }))
    .sort((a, b) => b.value - a.value)

  if (regions.length === 0) {
    throw new Error(`EIA returned no state-level ${config.productLabel} rows for the selected product`)
  }

  const reportedAreaValues = latestRecords.filter((record) => record.kind !== 'national').map((record) => record.value)
  const distributionValues = reportedAreaValues.length >= regions.length ? reportedAreaValues : regions.map((region) => region.value)
  const distribution = histogram(distributionValues, 10, 2)
  const stats = {
    mean: round(mean(distributionValues), 2),
    median: round(percentile(distributionValues, 0.5), 2),
    mode: distribution.reduce((best, bin) => (bin.count > best.count ? bin : best), distribution[0]).value,
    p95: round(percentile(distributionValues, 0.95), 2),
    p99: round(percentile(distributionValues, 0.99), 2),
  }

  return {
    id: config.id,
    label: config.label,
    unit: '$/gal',
    precision: 2,
    source: 'EIA Open Data API',
    sourceUrl: config.sourceUrl,
    cadence: 'Runtime server cache',
    asOf: `EIA weekly data through ${latestPeriod}; fetched ${new Date().toISOString()}`,
    isLive: true,
    summary: `Live EIA ${config.productLabel} data is normalized from reported state and regional series currently available for this product.`,
    mostPeople: `Most reported EIA ${config.productLabel} series cluster around ${formatRange(distributionValues)} per gallon.`,
    stats,
    distribution,
    regions,
    areas,
    trend: buildStateTrend(parsed),
  }
}

function parseRecords(records: EiaRecord[]): ParsedRecord[] {
  return records
    .map((record) => ({
      period: record.period,
      code: normalizeCode(record.duoarea),
      name: normalizeName(record.duoarea, record['duoarea-name']),
      kind: classifyArea(record.duoarea),
      value: Number(record.value),
    }))
    .filter((record) => Number.isFinite(record.value) && record.period)
}

function normalizeCode(code: string | undefined) {
  if (!code) return 'US'
  if (code === 'NUS') return 'US'
  if (/^S[A-Z]{2}$/.test(code)) return code.slice(1)
  return code.toUpperCase()
}

function classifyArea(code: string | undefined): ParsedRecord['kind'] {
  if (!code || code === 'NUS') return 'national'
  if (/^S[A-Z]{2}$/.test(code)) return 'state'
  return 'other'
}

function normalizeName(code: string | undefined, name: string | undefined) {
  if (code && /^S[A-Z]{2}$/.test(code)) {
    return stateNames[code.slice(1)] ?? code.slice(1)
  }

  if (code && areaNames[code]) {
    return areaNames[code]
  }

  return (name ?? code ?? 'Unknown area').replace(/^United States,?\s*/i, 'United States').replace(/ Regular Gasoline Prices.*$/i, '')
}

function buildStateTrend(parsed: ParsedRecord[]) {
  const grouped = new Map<string, number[]>()

  for (const record of parsed) {
    if (record.kind === 'national') continue
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

function formatRange(values: number[]) {
  const low = percentile(values, 0.25)
  const high = percentile(values, 0.75)
  return `$${low.toFixed(2)}-$${high.toFixed(2)}`
}
