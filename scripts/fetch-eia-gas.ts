import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

type EiaRecord = {
  period: string
  value: string | number
  duoarea?: string
  'duoarea-name'?: string
}

const apiKey = process.env.EIA_API_KEY

if (!apiKey) {
  console.warn('Missing EIA_API_KEY. Skipping EIA fetch; the app will use demo gasoline data.')
  process.exit(0)
}

const endpoint = new URL('https://api.eia.gov/v2/petroleum/pri/gnd/data/')
endpoint.searchParams.set('api_key', apiKey)
endpoint.searchParams.set('frequency', 'weekly')
endpoint.searchParams.set('data[0]', 'value')
endpoint.searchParams.set('facets[product][]', 'EPM0')
endpoint.searchParams.set('sort[0][column]', 'period')
endpoint.searchParams.set('sort[0][direction]', 'desc')
endpoint.searchParams.set('offset', '0')
endpoint.searchParams.set('length', '500')

const response = await fetch(endpoint)

if (!response.ok) {
  throw new Error(`EIA request failed: ${response.status} ${response.statusText}`)
}

const payload = (await response.json()) as { response?: { data?: EiaRecord[] } }
const records = payload.response?.data ?? []
const parsed = records
  .map((record) => ({
    period: record.period,
    code: normalizeCode(record.duoarea),
    name: normalizeName(record['duoarea-name'] ?? record.duoarea ?? 'Unknown area'),
    value: Number(record.value),
  }))
  .filter((record) => Number.isFinite(record.value) && record.period)

if (parsed.length === 0) {
  throw new Error('EIA returned no usable gasoline records.')
}

const latestPeriod = parsed[0].period
const latestRecords = parsed.filter((record) => record.period === latestPeriod)
const national = latestRecords.find((record) => record.code === 'US') ?? latestRecords[0]
const regions = latestRecords
  .filter((record) => record.code !== national.code)
  .map(({ code, name, value }) => ({ code, name, value }))
  .sort((a, b) => b.value - a.value)

const distributionValues = regions.length > 0 ? regions.map((region) => region.value) : latestRecords.map((record) => record.value)
const distribution = histogram(distributionValues, 10)
const stats = {
  mean: round(mean(distributionValues), 2),
  median: round(percentile(distributionValues, 0.5), 2),
  mode: distribution.reduce((best, bin) => (bin.count > best.count ? bin : best), distribution[0]).value,
  p95: round(percentile(distributionValues, 0.95), 2),
  p99: round(percentile(distributionValues, 0.99), 2),
}

const trend = parsed
  .filter((record) => record.code === national.code)
  .slice(0, 12)
  .reverse()
  .map((record) => ({
    month: record.period.slice(5),
    mean: round(record.value, 2),
    median: round(record.value, 2),
  }))

const cache = {
  id: 'gas',
  label: 'Retail Gasoline',
  unit: '$/gal',
  precision: 2,
  source: 'EIA Open Data API',
  sourceUrl: 'https://www.eia.gov/opendata/',
  cadence: 'Weekly EIA fetch; local cache',
  asOf: `EIA weekly data through ${latestPeriod}; cached ${new Date().toISOString()}`,
  summary:
    'Live EIA retail gasoline data is normalized into the same skew-aware dashboard shape as the local demo datasets.',
  mostPeople: `Most reported EIA regions cluster around ${formatRange(distributionValues)} per gallon.`,
  stats,
  distribution,
  regions: regions.slice(0, 12),
  trend,
}

const outputPath = resolve('public/data/eia-gas-cache.json')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')

console.log(`Wrote ${outputPath}`)

function normalizeCode(code: string | undefined) {
  if (!code) return 'US'
  if (code === 'NUS') return 'US'
  return code.replace(/^R/, '').replace(/^S/, '').slice(0, 4).toUpperCase()
}

function normalizeName(name: string) {
  return name.replace(/^United States,?\s*/i, 'United States').replace(/ Regular Gasoline Prices.*$/i, '')
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

function percentile(values: number[], quantile: number) {
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * quantile
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function histogram(values: number[], size: number) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 0.1)
  const step = span / size

  return Array.from({ length: size }, (_, index) => {
    const start = min + index * step
    const end = index === size - 1 ? max + 0.001 : start + step
    const value = round(start + step / 2, 2)
    return {
      label: value.toFixed(2),
      value,
      count: values.filter((item) => item >= start && item < end).length,
    }
  })
}

function formatRange(values: number[]) {
  const low = percentile(values, 0.25)
  const high = percentile(values, 0.75)
  return `$${low.toFixed(2)}-$${high.toFixed(2)}`
}

function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
