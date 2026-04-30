export type MetricKey = 'mean' | 'median' | 'mode' | 'p95' | 'p99'

export type StatSet = Record<MetricKey, number>

export type DistributionBin = {
  label: string
  value: number
  count: number
}

export type RegionValue = {
  code: string
  name: string
  value: number
}

export type TrendPoint = {
  month: string
  mean: number
  median: number
}

export type Dataset = {
  id: string
  label: string
  unit: string
  precision: number
  source: string
  sourceUrl: string
  cadence: string
  asOf: string
  isLive?: boolean
  unavailable?: boolean
  unavailableReason?: string
  summary: string
  mostPeople: string
  stats: StatSet
  distribution: DistributionBin[]
  regions: RegionValue[]
  areas?: RegionValue[]
  trend: TrendPoint[]
}

export type LocalSearchHit = {
  zip: string
  city: string
  state: string
  datasetId: string
  localMedian: number
}

export const datasets: Dataset[] = [
  {
    id: 'gas',
    label: 'Retail Gasoline',
    unit: '$/gal',
    precision: 2,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/gnd',
    cadence: 'Daily cache target',
    asOf: 'Demo snapshot for MVP wiring',
    summary:
      'Gas prices are a natural first dataset because local variation and premium outliers pull the national mean away from what many drivers see.',
    mostPeople: 'Most sampled stations cluster between $3.20 and $3.70 per gallon.',
    stats: { mean: 3.58, median: 3.42, mode: 3.31, p95: 4.68, p99: 5.21 },
    distribution: [
      { label: '2.80', value: 2.8, count: 7 },
      { label: '3.00', value: 3.0, count: 18 },
      { label: '3.20', value: 3.2, count: 44 },
      { label: '3.40', value: 3.4, count: 62 },
      { label: '3.60', value: 3.6, count: 48 },
      { label: '3.80', value: 3.8, count: 27 },
      { label: '4.00', value: 4.0, count: 15 },
      { label: '4.40', value: 4.4, count: 9 },
      { label: '4.80', value: 4.8, count: 4 },
      { label: '5.20', value: 5.2, count: 2 },
    ],
    regions: [
      { code: 'CA', name: 'California', value: 4.82 },
      { code: 'WA', name: 'Washington', value: 4.31 },
      { code: 'AZ', name: 'Arizona', value: 3.79 },
      { code: 'CO', name: 'Colorado', value: 3.48 },
      { code: 'TX', name: 'Texas', value: 3.08 },
      { code: 'IL', name: 'Illinois', value: 3.62 },
      { code: 'MI', name: 'Michigan', value: 3.37 },
      { code: 'GA', name: 'Georgia', value: 3.16 },
      { code: 'NY', name: 'New York', value: 3.71 },
      { code: 'FL', name: 'Florida', value: 3.35 },
    ],
    trend: [
      { month: 'May', mean: 3.67, median: 3.49 },
      { month: 'Jun', mean: 3.61, median: 3.44 },
      { month: 'Jul', mean: 3.55, median: 3.38 },
      { month: 'Aug', mean: 3.64, median: 3.45 },
      { month: 'Sep', mean: 3.7, median: 3.51 },
      { month: 'Oct', mean: 3.52, median: 3.37 },
      { month: 'Nov', mean: 3.39, median: 3.24 },
      { month: 'Dec', mean: 3.44, median: 3.29 },
      { month: 'Jan', mean: 3.49, median: 3.33 },
      { month: 'Feb', mean: 3.54, median: 3.38 },
      { month: 'Mar', mean: 3.57, median: 3.41 },
      { month: 'Apr', mean: 3.58, median: 3.42 },
    ],
  },
  {
    id: 'income',
    label: 'Household Income',
    unit: '$/yr',
    precision: 0,
    source: 'Census ACS + BLS',
    sourceUrl: 'https://www.census.gov/programs-surveys/acs/data.html',
    cadence: 'Annual source refresh',
    asOf: 'Demo snapshot for MVP wiring',
    summary:
      'Income is heavily right-skewed, so top households lift the average well above the typical household experience.',
    mostPeople: 'Most households in this sample sit between $45k and $105k per year.',
    stats: { mean: 98200, median: 74800, mode: 62000, p95: 248000, p99: 612000 },
    distribution: [
      { label: '25k', value: 25000, count: 20 },
      { label: '45k', value: 45000, count: 48 },
      { label: '65k', value: 65000, count: 70 },
      { label: '85k', value: 85000, count: 58 },
      { label: '105k', value: 105000, count: 39 },
      { label: '140k', value: 140000, count: 24 },
      { label: '190k', value: 190000, count: 12 },
      { label: '260k', value: 260000, count: 7 },
      { label: '400k', value: 400000, count: 3 },
      { label: '650k', value: 650000, count: 1 },
    ],
    regions: [
      { code: 'CA', name: 'California', value: 92300 },
      { code: 'WA', name: 'Washington', value: 91400 },
      { code: 'AZ', name: 'Arizona', value: 74200 },
      { code: 'CO', name: 'Colorado', value: 88900 },
      { code: 'TX', name: 'Texas', value: 76400 },
      { code: 'IL', name: 'Illinois', value: 79200 },
      { code: 'MI', name: 'Michigan', value: 68400 },
      { code: 'GA', name: 'Georgia', value: 73100 },
      { code: 'NY', name: 'New York', value: 81200 },
      { code: 'FL', name: 'Florida', value: 70200 },
    ],
    trend: [
      { month: '2015', mean: 74600, median: 56500 },
      { month: '2016', mean: 77100, median: 59000 },
      { month: '2017', mean: 81200, median: 61300 },
      { month: '2018', mean: 84600, median: 63100 },
      { month: '2019', mean: 88700, median: 68700 },
      { month: '2020', mean: 90400, median: 67500 },
      { month: '2021', mean: 92700, median: 70700 },
      { month: '2022', mean: 95600, median: 74500 },
      { month: '2023', mean: 98200, median: 74800 },
    ],
  },
  {
    id: 'housing',
    label: 'Home Prices',
    unit: '$',
    precision: 0,
    source: 'Census ACS + FHFA HPI',
    sourceUrl: 'https://www.fhfa.gov/data/hpi',
    cadence: 'Monthly/quarterly cache target',
    asOf: 'Demo snapshot for MVP wiring',
    summary:
      'Housing data needs distributions because expensive metros can dominate national averages while many counties move differently.',
    mostPeople: 'Most owner-occupied home values in this sample cluster from $220k to $460k.',
    stats: { mean: 432000, median: 328000, mode: 281000, p95: 985000, p99: 1840000 },
    distribution: [
      { label: '150k', value: 150000, count: 14 },
      { label: '220k', value: 220000, count: 42 },
      { label: '300k', value: 300000, count: 64 },
      { label: '380k', value: 380000, count: 53 },
      { label: '460k', value: 460000, count: 31 },
      { label: '620k', value: 620000, count: 19 },
      { label: '800k', value: 800000, count: 10 },
      { label: '1.1m', value: 1100000, count: 5 },
      { label: '1.5m', value: 1500000, count: 2 },
      { label: '1.9m', value: 1900000, count: 1 },
    ],
    regions: [
      { code: 'CA', name: 'California', value: 742000 },
      { code: 'WA', name: 'Washington', value: 604000 },
      { code: 'AZ', name: 'Arizona', value: 416000 },
      { code: 'CO', name: 'Colorado', value: 548000 },
      { code: 'TX', name: 'Texas', value: 306000 },
      { code: 'IL', name: 'Illinois', value: 276000 },
      { code: 'MI', name: 'Michigan', value: 232000 },
      { code: 'GA', name: 'Georgia', value: 318000 },
      { code: 'NY', name: 'New York', value: 418000 },
      { code: 'FL', name: 'Florida', value: 396000 },
    ],
    trend: [
      { month: 'May', mean: 398000, median: 305000 },
      { month: 'Jun', mean: 402000, median: 309000 },
      { month: 'Jul', mean: 407000, median: 313000 },
      { month: 'Aug', mean: 411000, median: 316000 },
      { month: 'Sep', mean: 416000, median: 319000 },
      { month: 'Oct', mean: 419000, median: 321000 },
      { month: 'Nov', mean: 423000, median: 324000 },
      { month: 'Dec', mean: 426000, median: 326000 },
      { month: 'Jan', mean: 428000, median: 327000 },
      { month: 'Feb', mean: 430000, median: 328000 },
      { month: 'Mar', mean: 431000, median: 328000 },
      { month: 'Apr', mean: 432000, median: 328000 },
    ],
  },
  {
    id: 'energy',
    label: 'Residential Energy',
    unit: 'c/kWh',
    precision: 1,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/electricity/retail-sales',
    cadence: 'Monthly cache target',
    asOf: 'Demo snapshot for MVP wiring',
    summary:
      'Residential electricity rates vary sharply by region, so median and percentile views help show the normal bill pressure.',
    mostPeople: 'Most sampled residential rates sit between 13 and 20 cents per kWh.',
    stats: { mean: 18.6, median: 16.9, mode: 14.8, p95: 31.2, p99: 41.5 },
    distribution: [
      { label: '10', value: 10, count: 10 },
      { label: '12', value: 12, count: 26 },
      { label: '14', value: 14, count: 52 },
      { label: '16', value: 16, count: 61 },
      { label: '18', value: 18, count: 41 },
      { label: '20', value: 20, count: 25 },
      { label: '24', value: 24, count: 13 },
      { label: '30', value: 30, count: 7 },
      { label: '36', value: 36, count: 3 },
      { label: '42', value: 42, count: 1 },
    ],
    regions: [
      { code: 'CA', name: 'California', value: 31.4 },
      { code: 'WA', name: 'Washington', value: 11.7 },
      { code: 'AZ', name: 'Arizona', value: 15.2 },
      { code: 'CO', name: 'Colorado', value: 15.0 },
      { code: 'TX', name: 'Texas', value: 15.4 },
      { code: 'IL', name: 'Illinois', value: 15.8 },
      { code: 'MI', name: 'Michigan', value: 18.3 },
      { code: 'GA', name: 'Georgia', value: 14.6 },
      { code: 'NY', name: 'New York', value: 23.1 },
      { code: 'FL', name: 'Florida', value: 15.7 },
    ],
    trend: [
      { month: 'May', mean: 17.5, median: 16.1 },
      { month: 'Jun', mean: 17.8, median: 16.2 },
      { month: 'Jul', mean: 18.1, median: 16.4 },
      { month: 'Aug', mean: 18.4, median: 16.7 },
      { month: 'Sep', mean: 18.5, median: 16.8 },
      { month: 'Oct', mean: 18.3, median: 16.7 },
      { month: 'Nov', mean: 18.1, median: 16.6 },
      { month: 'Dec', mean: 18.2, median: 16.7 },
      { month: 'Jan', mean: 18.4, median: 16.8 },
      { month: 'Feb', mean: 18.5, median: 16.8 },
      { month: 'Mar', mean: 18.6, median: 16.9 },
      { month: 'Apr', mean: 18.6, median: 16.9 },
    ],
  },
  {
    id: 'diesel',
    label: 'Diesel Prices',
    unit: '$/gal',
    precision: 2,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/gnd',
    cadence: 'Weekly cache target',
    asOf: 'Runtime source pending',
    summary:
      'Diesel prices shape shipping and farm-cost narratives, but regional diesel series can diverge sharply from national headlines.',
    mostPeople: 'Source data is loaded at runtime.',
    stats: { mean: 0, median: 0, mode: 0, p95: 0, p99: 0 },
    distribution: [],
    regions: [],
    trend: [],
  },
  {
    id: 'natgas',
    label: 'Residential Natural Gas',
    unit: '$/MCF',
    precision: 2,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/natural-gas/pri/sum',
    cadence: 'Monthly cache target',
    asOf: 'Runtime source pending',
    summary:
      'Heating-cost headlines often flatten very different state-level residential natural gas prices and seasonal patterns.',
    mostPeople: 'Source data is loaded at runtime.',
    stats: { mean: 0, median: 0, mode: 0, p95: 0, p99: 0 },
    distribution: [],
    regions: [],
    trend: [],
  },
  {
    id: 'generation',
    label: 'Renewable Grid Share',
    unit: '%',
    precision: 1,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/electricity/electric-power-operational-data',
    cadence: 'Monthly cache target',
    asOf: 'Runtime source pending',
    summary:
      'National grid-mix claims can hide how different each state electricity system really is.',
    mostPeople: 'Source data is loaded at runtime.',
    stats: { mean: 0, median: 0, mode: 0, p95: 0, p99: 0 },
    distribution: [],
    regions: [],
    trend: [],
  },
  {
    id: 'heatingoil',
    label: 'Heating Oil',
    unit: '$/gal',
    precision: 2,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/wfr',
    cadence: 'Weekly cache target',
    asOf: 'Runtime source pending',
    summary:
      'Heating oil is intensely regional, so a national residential price can obscure what cold-weather households actually pay.',
    mostPeople: 'Source data is loaded at runtime.',
    stats: { mean: 0, median: 0, mode: 0, p95: 0, p99: 0 },
    distribution: [],
    regions: [],
    trend: [],
  },
  {
    id: 'propane',
    label: 'Residential Propane',
    unit: '$/gal',
    precision: 2,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/wfr',
    cadence: 'Weekly cache target',
    asOf: 'Runtime source pending',
    summary:
      'Propane prices vary sharply by state and delivery market, making averages a weak proxy for household heating costs.',
    mostPeople: 'Source data is loaded at runtime.',
    stats: { mean: 0, median: 0, mode: 0, p95: 0, p99: 0 },
    distribution: [],
    regions: [],
    trend: [],
  },
  {
    id: 'elecspread',
    label: 'Home vs. Industrial Power Gap',
    unit: 'c/kWh',
    precision: 1,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/electricity/retail-sales',
    cadence: 'Monthly cache target',
    asOf: 'Runtime source pending',
    summary:
      'Electricity headlines often say “power prices” as if every customer pays the same; this shows how much more residential customers pay than industrial customers by state.',
    mostPeople: 'Source data is loaded at runtime.',
    stats: { mean: 0, median: 0, mode: 0, p95: 0, p99: 0 },
    distribution: [],
    regions: [],
    trend: [],
  },
  {
    id: 'crudegap',
    label: 'Gasoline vs. Crude Gap',
    unit: '$/gal',
    precision: 2,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/petroleum/pri/spt',
    cadence: 'Weekly cache target',
    asOf: 'Runtime source pending',
    summary:
      'Crude oil headlines do not translate one-for-one into pump prices; this estimates the regional retail gasoline premium over WTI crude converted to dollars per gallon.',
    mostPeople: 'Source data is loaded at runtime.',
    stats: { mean: 0, median: 0, mode: 0, p95: 0, p99: 0 },
    distribution: [],
    regions: [],
    trend: [],
  },
  {
    id: 'fossilgrid',
    label: 'Fossil Grid Share',
    unit: '%',
    precision: 1,
    source: 'EIA Open Data API',
    sourceUrl: 'https://www.eia.gov/opendata/browser/electricity/electric-power-operational-data',
    cadence: 'Monthly cache target',
    asOf: 'Runtime source pending',
    summary:
      'National clean-grid or fossil-grid claims can hide how differently each state still generates electricity.',
    mostPeople: 'Source data is loaded at runtime.',
    stats: { mean: 0, median: 0, mode: 0, p95: 0, p99: 0 },
    distribution: [],
    regions: [],
    trend: [],
  },
]

export const searchHits: LocalSearchHit[] = [
  { zip: '90210', city: 'Beverly Hills', state: 'CA', datasetId: 'gas', localMedian: 5.12 },
  { zip: '30303', city: 'Atlanta', state: 'GA', datasetId: 'gas', localMedian: 3.18 },
  { zip: '48226', city: 'Detroit', state: 'MI', datasetId: 'income', localMedian: 41100 },
  { zip: '10001', city: 'New York', state: 'NY', datasetId: 'housing', localMedian: 746000 },
  { zip: '78701', city: 'Austin', state: 'TX', datasetId: 'energy', localMedian: 14.9 },
]
