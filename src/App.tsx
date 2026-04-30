import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { geoAlbersUsa, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { feature } from 'topojson-client'
import statesAtlas from 'us-atlas/states-10m.json'
import {
  BarChart3,
  Database,
  Download,
  FileJson,
  Info,
  Map as MapIcon,
  Moon,
  Sun,
} from 'lucide-react'
import './App.css'
import { datasets, type Dataset, type MetricKey, type RegionValue } from './data'
import { boxSummary, densityCurve, distributionSummary } from './stats'

type ChartProps = {
  dataset: Dataset
  kind: 'trend'
  dark: boolean
}

const metricLabels: Record<MetricKey, string> = {
  mean: 'Mean',
  median: 'Median',
  mode: 'Mode',
  p95: 'p95',
  p99: 'p99',
}

const fipsToState: Record<string, { code: string; name: string }> = {
  '01': { code: 'AL', name: 'Alabama' },
  '02': { code: 'AK', name: 'Alaska' },
  '04': { code: 'AZ', name: 'Arizona' },
  '05': { code: 'AR', name: 'Arkansas' },
  '06': { code: 'CA', name: 'California' },
  '08': { code: 'CO', name: 'Colorado' },
  '09': { code: 'CT', name: 'Connecticut' },
  '10': { code: 'DE', name: 'Delaware' },
  '11': { code: 'DC', name: 'District of Columbia' },
  '12': { code: 'FL', name: 'Florida' },
  '13': { code: 'GA', name: 'Georgia' },
  '15': { code: 'HI', name: 'Hawaii' },
  '16': { code: 'ID', name: 'Idaho' },
  '17': { code: 'IL', name: 'Illinois' },
  '18': { code: 'IN', name: 'Indiana' },
  '19': { code: 'IA', name: 'Iowa' },
  '20': { code: 'KS', name: 'Kansas' },
  '21': { code: 'KY', name: 'Kentucky' },
  '22': { code: 'LA', name: 'Louisiana' },
  '23': { code: 'ME', name: 'Maine' },
  '24': { code: 'MD', name: 'Maryland' },
  '25': { code: 'MA', name: 'Massachusetts' },
  '26': { code: 'MI', name: 'Michigan' },
  '27': { code: 'MN', name: 'Minnesota' },
  '28': { code: 'MS', name: 'Mississippi' },
  '29': { code: 'MO', name: 'Missouri' },
  '30': { code: 'MT', name: 'Montana' },
  '31': { code: 'NE', name: 'Nebraska' },
  '32': { code: 'NV', name: 'Nevada' },
  '33': { code: 'NH', name: 'New Hampshire' },
  '34': { code: 'NJ', name: 'New Jersey' },
  '35': { code: 'NM', name: 'New Mexico' },
  '36': { code: 'NY', name: 'New York' },
  '37': { code: 'NC', name: 'North Carolina' },
  '38': { code: 'ND', name: 'North Dakota' },
  '39': { code: 'OH', name: 'Ohio' },
  '40': { code: 'OK', name: 'Oklahoma' },
  '41': { code: 'OR', name: 'Oregon' },
  '42': { code: 'PA', name: 'Pennsylvania' },
  '44': { code: 'RI', name: 'Rhode Island' },
  '45': { code: 'SC', name: 'South Carolina' },
  '46': { code: 'SD', name: 'South Dakota' },
  '47': { code: 'TN', name: 'Tennessee' },
  '48': { code: 'TX', name: 'Texas' },
  '49': { code: 'UT', name: 'Utah' },
  '50': { code: 'VT', name: 'Vermont' },
  '51': { code: 'VA', name: 'Virginia' },
  '53': { code: 'WA', name: 'Washington' },
  '54': { code: 'WV', name: 'West Virginia' },
  '55': { code: 'WI', name: 'Wisconsin' },
  '56': { code: 'WY', name: 'Wyoming' },
}

const petroleumAreaStates: Record<string, string[]> = {
  R1X: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'],
  R1Y: ['DE', 'DC', 'MD', 'NJ', 'NY', 'PA'],
  R1Z: ['AL', 'FL', 'GA', 'KY', 'MS', 'NC', 'SC', 'TN', 'VA', 'WV'],
  R20: ['IL', 'IN', 'IA', 'KS', 'MI', 'MN', 'MO', 'NE', 'ND', 'OH', 'OK', 'SD', 'WI'],
  R30: ['AR', 'LA', 'NM', 'TX'],
  R40: ['CO', 'ID', 'MT', 'UT', 'WY'],
  R5XCA: ['AK', 'AZ', 'HI', 'NV', 'OR', 'WA'],
  R50: ['AK', 'AZ', 'CA', 'HI', 'NV', 'OR', 'WA'],
  R10: ['CT', 'DE', 'DC', 'ME', 'MD', 'MA', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT', 'AL', 'FL', 'GA', 'KY', 'MS', 'NC', 'SC', 'TN', 'VA', 'WV'],
}

function formatValue(dataset: Dataset, value: number) {
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: dataset.precision,
    minimumFractionDigits: dataset.precision,
  }).format(value)

  if (dataset.unit === '$/gal') return `$${formatted}`
  if (dataset.unit === '$/yr') return `$${formatted}`
  if (dataset.unit === '$') return `$${formatted}`
  return `${formatted} ${dataset.unit}`
}

function formatMetricValue(dataset: Dataset, value: number) {
  if (dataset.unit === '$/yr' || dataset.unit === '$') {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}m`
    if (value >= 1_000) return `$${Math.round(value / 1_000)}k`
  }

  if (dataset.unit === 'c/kWh' || dataset.unit === '$/MCF' || dataset.unit === '%') {
    if (dataset.unit === '$/MCF') return `$${value.toFixed(dataset.precision)}`
    const suffix = dataset.unit === 'c/kWh' ? 'c' : '%'
    return `${value.toFixed(dataset.precision)}${suffix}`
  }

  return formatValue(dataset, value)
}

function EChart({ dataset, kind, dark }: ChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current, dark ? 'dark' : undefined)
    const muted = dark ? '#8794a5' : '#677281'
    const grid = dark ? '#293543' : '#dde5ef'

    const option = {
      animation: false,
      backgroundColor: 'transparent',
      color: ['#d65f3f', '#2f80ed'],
      grid: { top: 28, right: 22, bottom: 36, left: 58 },
      tooltip: { trigger: 'axis' },
      legend: { top: 0, right: 0, textStyle: { color: muted } },
      xAxis: {
        type: 'category',
        data: dataset.trend.map((point) => point.month),
        axisLabel: { color: muted },
        axisLine: { lineStyle: { color: grid } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: muted,
          formatter: (value: number) => compactValue(dataset, value),
        },
        splitLine: { lineStyle: { color: grid } },
      },
      series: [
        {
          name: 'Mean',
          type: 'line',
          smooth: true,
          data: dataset.trend.map((point) => point.mean),
          symbolSize: 7,
        },
        {
          name: 'Median',
          type: 'line',
          smooth: true,
          data: dataset.trend.map((point) => point.median),
          symbolSize: 7,
        },
      ],
    }

    chart.setOption(option)

    const resize = () => chart.resize()
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [dataset, kind, dark])

  return <div className="chart" ref={chartRef} role="img" aria-label={`${dataset.label} ${kind} chart`} />
}

function compactValue(dataset: Dataset, value: number) {
  if (dataset.unit === '$/yr' || dataset.unit === '$') {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`
    if (value >= 1_000) return `$${Math.round(value / 1_000)}k`
  }
  return value.toFixed(dataset.precision)
}

function DistributionPlot({ dataset }: { dataset: Dataset }) {
  const width = 760
  const height = 330
  const pad = { top: 24, right: 30, bottom: 46, left: 46 }
  const plotWidth = width - pad.left - pad.right
  const min = dataset.distribution[0]?.value ?? 0
  const max = Math.max(dataset.stats.p99, dataset.distribution.at(-1)?.value ?? min)
  const span = Math.max(max - min, 1)
  const x = (value: number) => pad.left + ((value - min) / span) * plotWidth
  const centerY = 118
  const maxHalfHeight = 72
  const density = densityCurve(dataset)
  const maxDensity = Math.max(...density.map((point) => point.density), 1)
  const upper = density.map((point) => `${x(point.value)},${centerY - (point.density / maxDensity) * maxHalfHeight}`).join(' ')
  const lower = [...density]
    .reverse()
    .map((point) => `${x(point.value)},${centerY + (point.density / maxDensity) * maxHalfHeight}`)
    .join(' ')
  const violinPoints = `${upper} ${lower}`
  const box = boxSummary(dataset)
  const maxCount = Math.max(...dataset.distribution.map((bin) => bin.count), 1)
  const barBase = height - pad.bottom
  const barMax = 78
  const barGap = 5
  const barWidth = Math.max(plotWidth / dataset.distribution.length - barGap, 8)
  const markers = [
    { key: 'mode', label: 'Mode', value: dataset.stats.mode, tone: 'accent' },
    { key: 'median', label: 'Median', value: dataset.stats.median, tone: 'accent' },
    { key: 'mean', label: 'Mean', value: dataset.stats.mean, tone: 'hot' },
    { key: 'p95', label: 'p95', value: dataset.stats.p95, tone: 'warn' },
    { key: 'p99', label: 'p99', value: dataset.stats.p99, tone: 'warn' },
  ]

  return (
    <figure className="distribution-figure">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="distribution-title distribution-desc">
        <title id="distribution-title">{dataset.label} violin and box plot</title>
        <desc id="distribution-desc">{distributionSummary(dataset)}</desc>
        <g className="plot-grid">
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <line key={tick} x1={pad.left + tick * plotWidth} x2={pad.left + tick * plotWidth} y1={pad.top} y2={barBase} />
          ))}
          {[0, 0.33, 0.66, 1].map((tick) => (
            <line key={tick} x1={pad.left} x2={width - pad.right} y1={pad.top + tick * (barBase - pad.top)} y2={pad.top + tick * (barBase - pad.top)} />
          ))}
        </g>

        <polygon className="violin-shape" points={violinPoints} />
        <line className="violin-center" x1={pad.left} x2={width - pad.right} y1={centerY} y2={centerY} />

        <g className="box-plot">
          <line x1={x(box.min)} x2={x(box.max)} y1={centerY} y2={centerY} />
          <rect x={x(box.q1)} y={centerY - 17} width={Math.max(x(box.q3) - x(box.q1), 3)} height={34} rx={4} />
          <line x1={x(box.median)} x2={x(box.median)} y1={centerY - 23} y2={centerY + 23} />
          <line x1={x(box.min)} x2={x(box.min)} y1={centerY - 14} y2={centerY + 14} />
          <line x1={x(box.max)} x2={x(box.max)} y1={centerY - 14} y2={centerY + 14} />
        </g>

        <g className="histogram-bars">
          {dataset.distribution.map((bin, index) => {
            const barHeight = (bin.count / maxCount) * barMax
            const barX = pad.left + index * (plotWidth / dataset.distribution.length) + barGap / 2
            return <rect key={bin.label} x={barX} y={barBase - barHeight} width={barWidth} height={barHeight} rx={3} />
          })}
        </g>

        <g className="plot-markers">
          {markers.map((marker, index) => (
            <g className={`plot-marker ${marker.tone}`} key={marker.key}>
              <line x1={x(marker.value)} x2={x(marker.value)} y1={pad.top} y2={barBase + 6} />
              <text x={x(marker.value)} y={index % 2 === 0 ? 18 : 34}>
                {marker.label}
              </text>
            </g>
          ))}
        </g>

        <g className="axis-labels">
          {dataset.distribution.map((bin) => (
            <text key={bin.label} x={x(bin.value)} y={height - 16}>
              {bin.label}
            </text>
          ))}
        </g>
      </svg>
      <figcaption>
        Violin density, weighted histogram, box plot, and percentile markers share one scale. {dataset.mostPeople}
      </figcaption>
    </figure>
  )
}

function USChoropleth({ dataset }: { dataset: Dataset }) {
  const [selectedCode, setSelectedCode] = useState(dataset.regions[0]?.code ?? 'US')
  const regionsByCode = useMemo(() => new Map(dataset.regions.map((region) => [region.code, region])), [dataset])
  const areasByCode = useMemo(() => new Map((dataset.areas ?? []).map((area) => [area.code, area])), [dataset])
  const selectedRegion = regionsByCode.get(selectedCode)
  const selectedArea = areasByCode.get(selectedCode)
  const selectedMapValue = selectedRegion ?? selectedArea ?? dataset.regions[0] ?? dataset.areas?.[0]
  const values = [...dataset.regions, ...(dataset.areas ?? [])].map((region) => region.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const geo = useMemo(() => {
    const atlas = statesAtlas as unknown as { objects: { states: unknown } }
    return feature(atlas as never, atlas.objects.states as never) as unknown as {
      features: Array<{ id?: string | number; properties: { name?: string }; geometry: unknown }>
    }
  }, [])
  const width = 760
  const height = 420
  const projection = useMemo(() => geoAlbersUsa().fitSize([width, height], geo as never), [geo])
  const path = useMemo(() => geoPath(projection), [projection])

  return (
    <div className="map-shell">
      <svg className="us-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${dataset.label} median by state choropleth`}>
        <g>
          {geo.features.map((state) => {
            const fips = String(state.id).padStart(2, '0')
            const stateMeta = fipsToState[fips]
            const region = stateMeta ? regionsByCode.get(stateMeta.code) : undefined
            const area = stateMeta ? areaForState(dataset, stateMeta.code, areasByCode) : undefined
            const value = region?.value ?? area?.value
            const label = stateMeta
              ? `${stateMeta.name}: ${value ? formatValue(dataset, value) : 'No state or regional EIA value for this series'}${area && !region ? ` (${area.name} regional series)` : ''}`
              : 'Unknown state'
            const statePath = path(state as unknown as GeoPermissibleObjects)

            if (!statePath || !stateMeta) return null

            return (
              <path
                aria-label={label}
                className={region ? 'map-state has-data state-data' : area ? 'map-state has-data area-data' : 'map-state missing-data'}
                d={statePath}
                fill={value ? choroplethColor(value, min, max) : undefined}
                key={fips}
                onClick={() => (region || area) && setSelectedCode(region?.code ?? area?.code ?? stateMeta.code)}
                onFocus={() => (region || area) && setSelectedCode(region?.code ?? area?.code ?? stateMeta.code)}
                role={region || area ? 'button' : undefined}
                tabIndex={region || area ? 0 : -1}
              >
                <title>{label}</title>
              </path>
            )
          })}
        </g>
      </svg>
      <div className="map-detail" aria-live="polite">
        {selectedMapValue ? (
          <>
            <span>{selectedMapValue.name}</span>
            <strong>{formatValue(dataset, selectedMapValue.value)}</strong>
            <small>{formatMapDifference(dataset, selectedMapValue, selectedArea && !selectedRegion ? 'reported-area' : 'state-sample')}</small>
          </>
        ) : (
          <>
            <span>No state selected</span>
            <strong>{formatValue(dataset, dataset.stats.median)}</strong>
            <small>National median</small>
          </>
        )}
      </div>
      <div className="map-legend" aria-hidden="true">
        <span>{dataset.areas?.length ? 'Lower among reported areas' : 'Lower among reported states'}</span>
        <i />
        <span>Higher</span>
      </div>
      <p className="map-note">
        {mapNote(dataset)}
      </p>
    </div>
  )
}

function areaForState(dataset: Dataset, stateCode: string, areasByCode: Map<string, RegionValue>) {
  if (!dataset.areas?.length) return undefined

  const preferredCodes = stateCode === 'CA' ? ['R50'] : ['R1X', 'R1Y', 'R1Z', 'R20', 'R30', 'R40', 'R5XCA', 'R50', 'R10']
  return preferredCodes
    .filter((areaCode) => petroleumAreaStates[areaCode]?.includes(stateCode))
    .map((areaCode) => areasByCode.get(areaCode))
    .find(Boolean)
}

function mapNote(dataset: Dataset) {
  if (dataset.id === 'gas') {
    return `EIA currently reports ${dataset.regions.length} state-level gasoline series plus ${dataset.areas?.length ?? 0} regional or metro series. Regional colors fill missing states only where EIA region boundaries are known.`
  }

  if (dataset.id === 'diesel') {
    return `EIA currently reports ${dataset.areas?.length ?? 0} regional diesel series plus ${dataset.regions.length} state-level diesel row. Regional colors are shown where state-level values are unavailable; state rows still take precedence.`
  }

  if (dataset.areas?.length) {
    return `${dataset.source} provides ${dataset.regions.length} state-level values plus ${dataset.areas.length} regional series for this view. Regional colors fill missing states only where EIA region boundaries are known.`
  }

  return `${dataset.source} provides ${dataset.regions.length} state-level values for this view. Missing states are intentionally left uncolored rather than estimated.`
}

function buildCsv(dataset: Dataset) {
  const rows = [
    ['section', 'dataset', 'label', 'value', 'unit'],
    ...Object.entries(dataset.stats).map(([key, value]) => ['metric', dataset.label, key, String(value), dataset.unit]),
    ...dataset.regions.map((region) => ['region', dataset.label, `${region.name} (${region.code})`, String(region.value), dataset.unit]),
    ...(dataset.areas ?? []).map((area) => ['area', dataset.label, `${area.name} (${area.code})`, String(area.value), dataset.unit]),
    ...dataset.trend.flatMap((point) => [
      ['trend', dataset.label, `${point.month} mean`, String(point.mean), dataset.unit],
      ['trend', dataset.label, `${point.month} median`, String(point.median), dataset.unit],
    ]),
  ]
  return rows.map((row) => row.map((value) => escapeCsv(String(value))).join(',')).join('\n')
}

function datasetDownloadHref(dataset: Dataset, type: 'csv' | 'json') {
  const payload = type === 'csv' ? buildCsv(dataset) : JSON.stringify(dataset, null, 2)
  const mimeType = type === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
  return `data:${mimeType},${encodeURIComponent(payload)}`
}

function escapeCsv(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function App() {
  const [availableDatasets, setAvailableDatasets] = useState<Dataset[]>(() =>
    datasets.map((dataset) =>
      emptyDataset(
        dataset,
        `Loading live ${dataset.label.toLowerCase()} data from ${dataset.source}.`,
      ),
    ),
  )
  const [activeId, setActiveId] = useState(datasets[0].id)
  const [dark, setDark] = useState(true)
  const activeDataset = availableDatasets.find((dataset) => dataset.id === activeId) ?? availableDatasets[0]
  const csvHref = useMemo(() => datasetDownloadHref(activeDataset, 'csv'), [activeDataset])
  const jsonHref = useMemo(() => datasetDownloadHref(activeDataset, 'json'), [activeDataset])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    let ignore = false

    function replaceDataset(nextDataset: Dataset) {
      if (ignore) return
      setAvailableDatasets((current) =>
        current.map((dataset) => (dataset.id === nextDataset.id ? nextDataset : dataset)),
      )
    }

    async function loadDataset(dataset: Dataset) {
      try {
        const response = await fetch(`/api/datasets/${dataset.id}`, { cache: 'no-store' })
        if (!response.ok) {
          const payload = await readErrorPayload(response)
          replaceDataset(
            emptyDataset(
              dataset,
              payload?.error ?? `${dataset.source} is unavailable. No values are displayed.`,
            ),
          )
          return
        }

        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) {
          replaceDataset(emptyDataset(dataset, 'The data API did not return JSON. No values are displayed.'))
          return
        }

        const payload = (await response.json()) as Dataset
        if (!isDatasetLike(payload) || ignore) {
          replaceDataset(emptyDataset(dataset, 'The data API response was incomplete. No values are displayed.'))
          return
        }

        replaceDataset({ ...dataset, ...payload, isLive: true, unavailable: false, unavailableReason: undefined })
      } catch {
        replaceDataset(emptyDataset(dataset, 'Unable to reach the local data API. No values are displayed.'))
      }
    }

    void Promise.all(datasets.map((dataset) => loadDataset(dataset)))

    return () => {
      ignore = true
    }
  }, [])

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="Primary">
        <a className="brand" href="#overview" aria-label="BeyondAverage home">
          <span className="brand-mark">BA</span>
          <span>BeyondAverage</span>
        </a>
        <nav className="nav-links" aria-label="Sections">
          <a href="#datasets">Datasets</a>
          <a href="#map">Geography</a>
          <a href="#data">About Data</a>
        </nav>
        <button className="icon-button" type="button" onClick={() => setDark((value) => !value)} aria-label="Toggle theme">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <section id="overview" className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Statistics without the spin</p>
          <h1>Beyond the national average.</h1>
          <p>
            Averages flatten skewed datasets into easy headlines. BeyondAverage uses open data,
            distributions, medians, modes, and percentiles to show what people actually experience,
            without political spin.
          </p>
        </div>

        <div className="hero-panel" aria-label={`${activeDataset.label} overview`}>
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">National snapshot</span>
              <h2>{activeDataset.label}</h2>
            </div>
            <span className="status-pill">
              {activeDataset.unavailable ? 'No data' : activeDataset.isLive ? 'Cached source' : 'Loading'}
            </span>
          </div>
          {activeDataset.unavailable ? (
            <NoDataPanel reason={activeDataset.unavailableReason} />
          ) : (
            <>
              <div className="metric-grid">
                {(Object.keys(metricLabels) as MetricKey[]).map((key) => (
                  <article className={key === 'median' ? 'metric-card emphasized' : 'metric-card'} key={key}>
                    <span>{metricLabels[key]}</span>
                    <strong>{formatMetricValue(activeDataset, activeDataset.stats[key])}</strong>
                    <div className="mini-bars" aria-hidden="true">
                      {activeDataset.distribution.slice(1, 9).map((bin) => (
                        <i style={{ height: `${18 + bin.count * 0.8}px` }} key={`${key}-${bin.label}`} />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <p className="panel-note">{activeDataset.mostPeople}</p>
              <p className="median-explainer">
                Median is highlighted because it marks the middle reported value. When high outliers lift the mean, the median is often closer to what a typical person sees.
              </p>
            </>
          )}
          <p className="source-meta">{activeDataset.asOf}</p>
        </div>
      </section>

      <section id="datasets" className="section-grid">
        <aside className="dataset-rail" aria-label="Dataset selector">
          <div className="rail-heading">
            <Database size={18} />
            <span>Datasets</span>
          </div>
          {availableDatasets.map((dataset) => (
            <button
              className={dataset.id === activeDataset.id ? 'dataset-tab active' : 'dataset-tab'}
              key={dataset.id}
              type="button"
              aria-label={`Open ${dataset.label} dataset`}
              onClick={() => setActiveId(dataset.id)}
            >
              <span>{dataset.label}</span>
              <small>{dataset.source}</small>
            </button>
          ))}
        </aside>

        <div className="dashboard-stack">
          <section className="tool-row compact" aria-label="Dataset actions">
            {activeDataset.unavailable ? (
              <>
                <button className="action-button disabled" type="button" disabled>
                  <Download size={17} />
                  Download CSV
                </button>
                <button className="action-button disabled" type="button" disabled>
                  <FileJson size={17} />
                  Download JSON
                </button>
              </>
            ) : (
              <>
                <a className="action-button" download={`beyondaverage-${activeDataset.id}.csv`} href={csvHref}>
                  <Download size={17} />
                  Download CSV
                </a>
                <a className="action-button" download={`beyondaverage-${activeDataset.id}.json`} href={jsonHref}>
                  <FileJson size={17} />
                  Download JSON
                </a>
              </>
            )}
          </section>

          {activeDataset.unavailable ? (
            <section className="chart-card no-data-wide">
              <NoDataPanel reason={activeDataset.unavailableReason} />
            </section>
          ) : (
            <>
              <section className="analysis-grid">
                <article className="chart-card wide">
                  <div className="card-title">
                    <BarChart3 size={18} />
                    <h2>Violin + Box Distribution</h2>
                  </div>
                  <DistributionPlot dataset={activeDataset} />
                </article>

                <article className="chart-card">
                  <div className="card-title">
                    <Info size={18} />
                    <h2>Percentile Ladder</h2>
                  </div>
                  <div className="ladder">
                    {(Object.keys(metricLabels) as MetricKey[]).map((key) => (
                      <div className="ladder-row" key={key}>
                        <span>{metricLabels[key]}</span>
                        <div className="ladder-track">
                          <span style={{ width: `${ladderWidth(key)}%` }} />
                        </div>
                        <strong>{formatValue(activeDataset, activeDataset.stats[key])}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="small-copy">
                    Percentiles show how far into the distribution a value sits. p95 means 95% of reported values are at or below that point; p99 shows the high-end tail that can pull averages away from typical experience.
                  </p>
                </article>
              </section>

              <section id="map" className="analysis-grid">
                <article className="chart-card">
                  <div className="card-title">
                    <MapIcon size={18} />
                    <h2>
                      {activeDataset.id === 'gas'
                        ? 'EIA State Series Map'
                        : activeDataset.id === 'energy' || activeDataset.id === 'natgas' || activeDataset.id === 'diesel'
                          ? 'State Price Map'
                          : activeDataset.id === 'generation'
                            ? 'Renewable Share Map'
                          : 'State Median Map'}
                    </h2>
                  </div>
                  <USChoropleth dataset={activeDataset} key={activeDataset.id} />
                </article>

                <article className="chart-card wide">
                  <div className="card-title">
                    <BarChart3 size={18} />
                    <h2>{activeDataset.isLive && activeDataset.id === 'gas' ? 'State Sample Mean vs. Median Trend' : 'Mean vs. Median Trend'}</h2>
                  </div>
                  <EChart dataset={activeDataset} kind="trend" dark={dark} />
                </article>
              </section>
            </>
          )}

        </div>
      </section>

      <section id="data" className="data-band">
        <div>
          <p className="eyebrow">About the data</p>
          <h2>Source rights and notices.</h2>
        </div>
        <p>
          BeyondAverage compiles and transforms public-source datasets for informational purposes only.
          Source data remains subject to the terms, limitations, revisions, and disclaimers of each
          originating agency. BeyondAverage analysis, design, code, and compiled presentation are
          copyright 2026. All rights reserved.
        </p>
        <a href={activeDataset.sourceUrl} target="_blank" rel="noreferrer">
          Open source data: {activeDataset.source}
        </a>
      </section>
    </main>
  )
}

function isDatasetLike(value: unknown): value is Dataset {
  const candidate = value as Dataset
  return Boolean(
    candidate &&
      candidate.id &&
      candidate.stats?.median &&
      Array.isArray(candidate.distribution) &&
      Array.isArray(candidate.regions) &&
      Array.isArray(candidate.trend),
  )
}

async function readErrorPayload(response: Response): Promise<{ error?: string } | null> {
  try {
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return null
    return (await response.json()) as { error?: string }
  } catch {
    return null
  }
}

function NoDataPanel({ reason }: { reason?: string }) {
  return (
    <div className="no-data-panel" role="status">
      <strong>No data available</strong>
      <p>{reason ?? 'The upstream source did not return usable data, so BeyondAverage is not displaying placeholder values.'}</p>
    </div>
  )
}

function emptyDataset(dataset: Dataset, reason: string): Dataset {
  return {
    ...dataset,
    asOf: 'No current source data loaded',
    isLive: false,
    unavailable: true,
    unavailableReason: reason,
    mostPeople: 'No data available from the current source.',
    stats: { mean: 0, median: 0, mode: 0, p95: 0, p99: 0 },
    distribution: [],
    regions: [],
    trend: [],
  }
}

function ladderWidth(key: MetricKey) {
  return { mean: 54, median: 43, mode: 36, p95: 82, p99: 100 }[key]
}

function formatMapDifference(dataset: Dataset, region: RegionValue, baselineLabel: 'state-sample' | 'reported-area') {
  const delta = region.value - dataset.stats.median
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''
  const direction = delta > 0 ? 'above' : delta < 0 ? 'below' : 'at'
  const amount = formatValue(dataset, Math.abs(delta))
  const label = baselineLabel === 'reported-area' ? 'reported-area median' : 'state-sample median'

  return direction === 'at' ? `+${formatValue(dataset, 0)} vs. ${label}` : `${sign}${amount} ${direction} ${label}`
}

function choroplethColor(value: number, min: number, max: number) {
  const ratio = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 0.01)))
  const low = [45, 188, 174]
  const mid = [255, 185, 63]
  const high = [255, 109, 63]
  const [start, end, localRatio] = ratio < 0.5 ? [low, mid, ratio * 2] : [mid, high, (ratio - 0.5) * 2]
  const channel = (index: number) => Math.round(start[index] + (end[index] - start[index]) * localRatio)

  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}

export default App
