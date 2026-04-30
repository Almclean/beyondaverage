import type { Dataset, RegionValue, TrendPoint } from '../src/data'
import {
  compactNumber,
  round,
  sourceBinsToDistribution,
  weightedMean,
  weightedMode,
  weightedPercentile,
} from './dataset-utils'

type CensusRow = Record<string, string>
type CensusDatasetId = 'income' | 'housing'

const acsYear = 2024
const acsProduct = 'acs/acs5'
const stateFips: Record<string, string> = {
  '01': 'AL',
  '02': 'AK',
  '04': 'AZ',
  '05': 'AR',
  '06': 'CA',
  '08': 'CO',
  '09': 'CT',
  '10': 'DE',
  '11': 'DC',
  '12': 'FL',
  '13': 'GA',
  '15': 'HI',
  '16': 'ID',
  '17': 'IL',
  '18': 'IN',
  '19': 'IA',
  '20': 'KS',
  '21': 'KY',
  '22': 'LA',
  '23': 'ME',
  '24': 'MD',
  '25': 'MA',
  '26': 'MI',
  '27': 'MN',
  '28': 'MS',
  '29': 'MO',
  '30': 'MT',
  '31': 'NE',
  '32': 'NV',
  '33': 'NH',
  '34': 'NJ',
  '35': 'NM',
  '36': 'NY',
  '37': 'NC',
  '38': 'ND',
  '39': 'OH',
  '40': 'OK',
  '41': 'OR',
  '42': 'PA',
  '44': 'RI',
  '45': 'SC',
  '46': 'SD',
  '47': 'TN',
  '48': 'TX',
  '49': 'UT',
  '50': 'VT',
  '51': 'VA',
  '53': 'WA',
  '54': 'WV',
  '55': 'WI',
  '56': 'WY',
}

const incomeBins = [
  ['B19001_002E', '10k', 0, 10_000],
  ['B19001_003E', '12k', 10_000, 15_000],
  ['B19001_004E', '17k', 15_000, 20_000],
  ['B19001_005E', '22k', 20_000, 25_000],
  ['B19001_006E', '27k', 25_000, 30_000],
  ['B19001_007E', '32k', 30_000, 35_000],
  ['B19001_008E', '37k', 35_000, 40_000],
  ['B19001_009E', '42k', 40_000, 45_000],
  ['B19001_010E', '47k', 45_000, 50_000],
  ['B19001_011E', '55k', 50_000, 60_000],
  ['B19001_012E', '67k', 60_000, 75_000],
  ['B19001_013E', '87k', 75_000, 100_000],
  ['B19001_014E', '112k', 100_000, 125_000],
  ['B19001_015E', '137k', 125_000, 150_000],
  ['B19001_016E', '175k', 150_000, 200_000],
  ['B19001_017E', '250k', 200_000, 300_000],
] as const

const housingBins = [
  ['B25075_002E', '10k', 0, 10_000],
  ['B25075_003E', '12k', 10_000, 15_000],
  ['B25075_004E', '17k', 15_000, 20_000],
  ['B25075_005E', '22k', 20_000, 25_000],
  ['B25075_006E', '27k', 25_000, 30_000],
  ['B25075_007E', '32k', 30_000, 35_000],
  ['B25075_008E', '37k', 35_000, 40_000],
  ['B25075_009E', '45k', 40_000, 50_000],
  ['B25075_010E', '55k', 50_000, 60_000],
  ['B25075_011E', '65k', 60_000, 70_000],
  ['B25075_012E', '75k', 70_000, 80_000],
  ['B25075_013E', '85k', 80_000, 90_000],
  ['B25075_014E', '95k', 90_000, 100_000],
  ['B25075_015E', '112k', 100_000, 125_000],
  ['B25075_016E', '137k', 125_000, 150_000],
  ['B25075_017E', '162k', 150_000, 175_000],
  ['B25075_018E', '187k', 175_000, 200_000],
  ['B25075_019E', '225k', 200_000, 250_000],
  ['B25075_020E', '275k', 250_000, 300_000],
  ['B25075_021E', '350k', 300_000, 400_000],
  ['B25075_022E', '450k', 400_000, 500_000],
  ['B25075_023E', '625k', 500_000, 750_000],
  ['B25075_024E', '875k', 750_000, 1_000_000],
  ['B25075_025E', '1.25m', 1_000_000, 1_500_000],
  ['B25075_026E', '1.75m', 1_500_000, 2_000_000],
  ['B25075_027E', '2.5m', 2_000_000, 3_000_000],
] as const

export async function buildCensusDataset(id: CensusDatasetId): Promise<Dataset> {
  const config = id === 'income' ? incomeConfig() : housingConfig()
  const [national, states, trend] = await Promise.all([
    fetchCensusRows(acsYear, config.variables, 'us:*'),
    fetchCensusRows(acsYear, [config.medianVariable], 'state:*'),
    buildTrend(config),
  ])
  const nationalRow = national[0]

  if (!nationalRow) {
    throw new Error(`Census returned no national ${config.label} rows`)
  }

  const bins = config.bins.map(([variable, label, low, high]) => ({
    label,
    low,
    high,
    count: numberFrom(nationalRow[variable]),
  }))
  const regions = states
    .map((row): RegionValue => ({
      code: stateFips[row.state] ?? row.state,
      name: row.NAME,
      value: numberFrom(row[config.medianVariable]),
    }))
    .filter((region) => Number.isFinite(region.value) && region.value > 0)
    .sort((a, b) => b.value - a.value)

  if (regions.length === 0) {
    throw new Error(`Census returned no state ${config.label} rows`)
  }

  const stats = {
    mean: round(weightedMean(bins), config.precision),
    median: round(numberFrom(nationalRow[config.medianVariable]), config.precision),
    mode: round(weightedMode(bins), config.precision),
    p95: round(weightedPercentile(bins, 0.95), config.precision),
    p99: round(weightedPercentile(bins, 0.99), config.precision),
  }
  const q1 = compactNumber(round(weightedPercentile(bins, 0.25), config.precision))
  const q3 = compactNumber(round(weightedPercentile(bins, 0.75), config.precision))

  return {
    id,
    label: config.label,
    unit: config.unit,
    precision: config.precision,
    source: config.source,
    sourceUrl: config.sourceUrl,
    cadence: 'Runtime server cache',
    asOf: `Census ACS ${acsYear} 5-year data; fetched ${new Date().toISOString()}`,
    isLive: true,
    summary: config.summary,
    mostPeople: `Most source-bin observations sit around $${q1}-$${q3}.`,
    stats,
    distribution: sourceBinsToDistribution(bins),
    regions,
    trend,
  }
}

function incomeConfig() {
  return {
    label: 'Household Income',
    unit: '$/yr',
    precision: 0,
    source: 'Census ACS 5-year',
    sourceUrl: 'https://api.census.gov/data/2024/acs/acs5.html',
    medianVariable: 'B19013_001E',
    variables: ['B19013_001E', ...incomeBins.map(([variable]) => variable)],
    bins: incomeBins,
    summary:
      'Income is heavily right-skewed, so high-income households can lift the average above the typical household experience.',
  }
}

function housingConfig() {
  return {
    label: 'Home Prices',
    unit: '$',
    precision: 0,
    source: 'Census ACS 5-year',
    sourceUrl: 'https://api.census.gov/data/2024/acs/acs5.html',
    medianVariable: 'B25077_001E',
    variables: ['B25077_001E', ...housingBins.map(([variable]) => variable)],
    bins: housingBins,
    summary:
      'Owner-occupied home values are right-skewed, so expensive markets can pull national averages above the middle household.',
  }
}

async function buildTrend(config: ReturnType<typeof incomeConfig> | ReturnType<typeof housingConfig>): Promise<TrendPoint[]> {
  const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]
  const rows = await Promise.all(
    years.map(async (year) => {
      const [row] = await fetchCensusRows(year, config.variables, 'us:*')
      const bins = config.bins.map(([variable, label, low, high]) => ({
        label,
        low,
        high,
        count: numberFrom(row?.[variable]),
      }))

      return {
        month: String(year),
        mean: round(weightedMean(bins), config.precision),
        median: round(numberFrom(row?.[config.medianVariable]), config.precision),
      }
    }),
  )

  return rows.filter((row) => Number.isFinite(row.mean) && Number.isFinite(row.median) && row.median > 0)
}

async function fetchCensusRows(year: number, variables: readonly string[], geography: string): Promise<CensusRow[]> {
  const endpoint = new URL(`https://api.census.gov/data/${year}/${acsProduct}`)
  endpoint.searchParams.set('get', ['NAME', ...variables].join(','))
  endpoint.searchParams.set('for', geography)

  const response = await fetch(endpoint)
  if (!response.ok) {
    throw new Error(`Census request failed: ${response.status} ${response.statusText}`)
  }

  const [header, ...rows] = (await response.json()) as string[][]
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])))
}

function numberFrom(value: string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}
