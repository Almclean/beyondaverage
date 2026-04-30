import type { Dataset } from '../src/data'
import { histogram, mean, percentile, round } from './dataset-utils'
import { stateNamesByCode } from './us-states'

type WeeklyFuelRecord = {
  period: string
  duoarea?: string
  'area-name'?: string
  process?: string
  value: string | number
}

type ParsedWeeklyFuelRecord = {
  period: string
  code: string
  name: string
  kind: 'national' | 'state' | 'area'
  value: number
}

const areaNames: Record<string, string> = {
  R10: 'East Coast',
  R20: 'Midwest',
  R30: 'Gulf Coast',
  R40: 'Rocky Mountain',
  R50: 'West Coast',
}

export function buildEiaHeatingOilDataset() {
  return buildWeeklyFuelDataset({
    id: 'heatingoil',
    label: 'Heating Oil',
    product: 'EPD2F',
    productLabel: 'heating oil',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/wfr',
    summary:
      'Heating oil is intensely regional, so a national residential price can obscure what cold-weather households actually pay.',
  })
}

export function buildEiaPropaneDataset() {
  return buildWeeklyFuelDataset({
    id: 'propane',
    label: 'Residential Propane',
    product: 'EPLLPA',
    productLabel: 'propane',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/wfr',
    summary:
      'Propane prices vary sharply by state and delivery market, making averages a weak proxy for household heating costs.',
  })
}

async function buildWeeklyFuelDataset(config: {
  id: string
  label: string
  product: string
  productLabel: string
  sourceUrl: string
  summary: string
}): Promise<Dataset> {
  const apiKey = process.env.EIA_API_KEY

  if (!apiKey) {
    throw new Error('Missing EIA_API_KEY')
  }

  const endpoint = new URL('https://api.eia.gov/v2/petroleum/pri/wfr/data/')
  endpoint.searchParams.set('api_key', apiKey)
  endpoint.searchParams.set('frequency', 'weekly')
  endpoint.searchParams.set('data[0]', 'value')
  endpoint.searchParams.set('facets[product][]', config.product)
  endpoint.searchParams.set('facets[process][]', 'PRS')
  endpoint.searchParams.set('sort[0][column]', 'period')
  endpoint.searchParams.set('sort[0][direction]', 'desc')
  endpoint.searchParams.set('offset', '0')
  endpoint.searchParams.set('length', '5000')

  const response = await fetch(endpoint)

  if (!response.ok) {
    throw new Error(`EIA ${config.productLabel} request failed: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as { response?: { data?: WeeklyFuelRecord[] } }
  const parsed = parseRecords(payload.response?.data ?? [])

  if (parsed.length === 0) {
    throw new Error(`EIA returned no usable ${config.productLabel} records`)
  }

  return normalizeWeeklyFuelDataset(parsed, config)
}

function normalizeWeeklyFuelDataset(
  parsed: ParsedWeeklyFuelRecord[],
  config: { id: string; label: string; productLabel: string; sourceUrl: string; summary: string },
): Dataset {
  const latestPeriod = parsed[0].period
  const latestRecords = parsed.filter((record) => record.period === latestPeriod)
  const regions = latestRecords
    .filter((record) => record.kind === 'state')
    .map(({ code, name, value }) => ({ code, name, value: round(value, 2) }))
    .sort((a, b) => b.value - a.value)
  const areas = latestRecords
    .filter((record) => record.kind === 'area')
    .map(({ code, name, value }) => ({ code, name, value: round(value, 2) }))
    .sort((a, b) => b.value - a.value)

  if (regions.length === 0) {
    throw new Error(`EIA returned no state-level ${config.productLabel} rows`)
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
    id: config.id,
    label: config.label,
    unit: '$/gal',
    precision: 2,
    source: 'EIA Open Data API',
    sourceUrl: config.sourceUrl,
    cadence: 'Runtime server cache',
    asOf: `EIA weekly residential price data through ${latestPeriod}; fetched ${new Date().toISOString()}`,
    isLive: true,
    summary: config.summary,
    mostPeople: `Most reported state ${config.productLabel} prices cluster around $${percentile(values, 0.25).toFixed(2)}-$${percentile(values, 0.75).toFixed(2)} per gallon.`,
    stats,
    distribution,
    regions,
    areas,
    trend: buildTrend(parsed.filter((record) => record.kind === 'state')),
  }
}

function parseRecords(records: WeeklyFuelRecord[]): ParsedWeeklyFuelRecord[] {
  return records
    .filter((record) => record.process === 'PRS')
    .map((record) => {
      const code = normalizeCode(record.duoarea)
      return {
        period: record.period,
        code,
        name: normalizeName(code, record['area-name']),
        kind: classifyArea(record.duoarea),
        value: Number(record.value),
      }
    })
    .filter((record) => record.period && record.code && Number.isFinite(record.value) && record.value > 0)
}

function normalizeCode(code: string | undefined) {
  if (!code) return ''
  if (code === 'NUS') return 'US'
  if (/^S[A-Z]{2}$/.test(code)) return code.slice(1)
  return code.toUpperCase()
}

function classifyArea(code: string | undefined): ParsedWeeklyFuelRecord['kind'] {
  if (!code || code === 'NUS') return 'national'
  if (/^S[A-Z]{2}$/.test(code)) return 'state'
  return 'area'
}

function normalizeName(code: string, areaName: string | undefined) {
  if (stateNamesByCode[code]) return stateNamesByCode[code]
  if (areaNames[code]) return areaNames[code]
  return areaName?.replace(/^USA-/, '') ?? code
}

function buildTrend(parsed: ParsedWeeklyFuelRecord[]) {
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
