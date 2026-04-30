import type { Dataset, RegionValue } from '../src/data'
import { histogram, mean, percentile, round } from './dataset-utils'

type GasRecord = {
  period: string
  duoarea?: string
  'duoarea-name'?: string
  value: string | number
}

type CrudeRecord = {
  period: string
  value: string | number
}

type ParsedGasRecord = {
  period: string
  code: string
  name: string
  kind: 'national' | 'state' | 'area'
  value: number
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

export async function buildEiaCrudeGapDataset(): Promise<Dataset> {
  const apiKey = process.env.EIA_API_KEY

  if (!apiKey) {
    throw new Error('Missing EIA_API_KEY')
  }

  const [gasRecords, crudeRecords] = await Promise.all([fetchGasRecords(apiKey), fetchCrudeRecords(apiKey)])
  const parsedGas = parseGasRecords(gasRecords)
  const parsedCrude = crudeRecords
    .map((record) => ({ period: record.period, value: Number(record.value) / 42 }))
    .filter((record) => record.period && Number.isFinite(record.value) && record.value > 0)
    .sort((left, right) => right.period.localeCompare(left.period))

  if (parsedGas.length === 0 || parsedCrude.length === 0) {
    throw new Error('EIA returned no usable gasoline or WTI crude records')
  }

  return normalizeCrudeGapDataset(parsedGas, parsedCrude)
}

async function fetchGasRecords(apiKey: string) {
  const endpoint = new URL('https://api.eia.gov/v2/petroleum/pri/gnd/data/')
  endpoint.searchParams.set('api_key', apiKey)
  endpoint.searchParams.set('frequency', 'weekly')
  endpoint.searchParams.set('data[0]', 'value')
  endpoint.searchParams.set('facets[product][]', 'EPM0')
  endpoint.searchParams.set('sort[0][column]', 'period')
  endpoint.searchParams.set('sort[0][direction]', 'desc')
  endpoint.searchParams.set('offset', '0')
  endpoint.searchParams.set('length', '5000')

  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`EIA gasoline request failed: ${response.status} ${response.statusText}`)
  const payload = (await response.json()) as { response?: { data?: GasRecord[] } }
  return payload.response?.data ?? []
}

async function fetchCrudeRecords(apiKey: string) {
  const endpoint = new URL('https://api.eia.gov/v2/petroleum/pri/spt/data/')
  endpoint.searchParams.set('api_key', apiKey)
  endpoint.searchParams.set('frequency', 'weekly')
  endpoint.searchParams.set('data[0]', 'value')
  endpoint.searchParams.set('facets[product][]', 'EPCWTI')
  endpoint.searchParams.set('sort[0][column]', 'period')
  endpoint.searchParams.set('sort[0][direction]', 'desc')
  endpoint.searchParams.set('offset', '0')
  endpoint.searchParams.set('length', '5000')

  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`EIA WTI crude request failed: ${response.status} ${response.statusText}`)
  const payload = (await response.json()) as { response?: { data?: CrudeRecord[] } }
  return payload.response?.data ?? []
}

function normalizeCrudeGapDataset(gasRecords: ParsedGasRecord[], crudeRecords: Array<{ period: string; value: number }>): Dataset {
  const latestGasPeriod = gasRecords[0].period
  const latestCrude = nearestCrude(latestGasPeriod, crudeRecords)

  if (!latestCrude) {
    throw new Error('No WTI crude period aligns with the latest gasoline period')
  }

  const latestRecords = gasRecords.filter((record) => record.period === latestGasPeriod && record.kind !== 'national')
  const gapRows = latestRecords.map((record) => ({ ...record, value: record.value - latestCrude.value }))
  const regions = gapRows
    .filter((record) => record.kind === 'state')
    .map(({ code, name, value }) => ({ code, name, value: round(value, 2) }))
    .sort((a, b) => b.value - a.value)
  const areas = gapRows
    .filter((record) => record.kind === 'area')
    .map(({ code, name, value }) => ({ code, name, value: round(value, 2) }))
    .sort((a, b) => b.value - a.value)
  const values = [...regions, ...areas].map((region) => region.value)

  if (values.length === 0) {
    throw new Error('No gasoline region rows available for crude gap calculation')
  }

  const distribution = histogram(values, 10, 2)
  const stats = {
    mean: round(mean(values), 2),
    median: round(percentile(values, 0.5), 2),
    mode: distribution.reduce((best, bin) => (bin.count > best.count ? bin : best), distribution[0]).value,
    p95: round(percentile(values, 0.95), 2),
    p99: round(percentile(values, 0.99), 2),
  }

  return {
    id: 'crudegap',
    label: 'Gasoline vs. Crude Gap',
    unit: '$/gal',
    precision: 2,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/spt',
    cadence: 'Runtime server cache',
    asOf: `EIA gasoline data through ${latestGasPeriod}; WTI through ${latestCrude.period}; fetched ${new Date().toISOString()}`,
    isLive: true,
    summary:
      'Crude oil headlines do not translate one-for-one into pump prices; this estimates the regional retail gasoline premium over WTI crude converted to dollars per gallon.',
    mostPeople: `Most reported regional retail-minus-crude gaps cluster around $${percentile(values, 0.25).toFixed(2)}-$${percentile(values, 0.75).toFixed(2)} per gallon.`,
    stats,
    distribution,
    regions,
    areas,
    trend: buildTrend(gasRecords, crudeRecords),
  }
}

function parseGasRecords(records: GasRecord[]): ParsedGasRecord[] {
  return records
    .map((record) => ({
      period: record.period,
      code: normalizeCode(record.duoarea),
      name: normalizeName(record.duoarea, record['duoarea-name']),
      kind: classifyArea(record.duoarea),
      value: Number(record.value),
    }))
    .filter((record) => record.period && record.code && Number.isFinite(record.value) && record.value > 0)
}

function normalizeCode(code: string | undefined) {
  if (!code) return ''
  if (code === 'NUS') return 'US'
  if (/^S[A-Z]{2}$/.test(code)) return code.slice(1)
  return code.toUpperCase()
}

function classifyArea(code: string | undefined): ParsedGasRecord['kind'] {
  if (!code || code === 'NUS') return 'national'
  if (/^S[A-Z]{2}$/.test(code)) return 'state'
  return 'area'
}

function normalizeName(code: string | undefined, name: string | undefined) {
  if (code && areaNames[code]) return areaNames[code]
  return (name ?? code ?? 'Unknown area').replace(/^United States,?\s*/i, 'United States').replace(/ Regular Gasoline Prices.*$/i, '')
}

function nearestCrude(period: string, crudeRecords: Array<{ period: string; value: number }>) {
  return crudeRecords.find((record) => record.period <= period) ?? crudeRecords.at(-1)
}

function buildTrend(gasRecords: ParsedGasRecord[], crudeRecords: Array<{ period: string; value: number }>) {
  const grouped = new Map<string, RegionValue[]>()

  for (const record of gasRecords) {
    if (record.kind === 'national') continue
    const crude = nearestCrude(record.period, crudeRecords)
    if (!crude) continue
    grouped.set(record.period, [...(grouped.get(record.period) ?? []), { code: record.code, name: record.name, value: record.value - crude.value }])
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-12)
    .map(([period, values]) => ({
      month: period,
      mean: round(mean(values.map((value) => value.value)), 2),
      median: round(percentile(values.map((value) => value.value), 0.5), 2),
    }))
}
