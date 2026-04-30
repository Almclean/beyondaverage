import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { buildCensusDataset } from './server/census'
import { buildEiaCrudeGapDataset } from './server/eia-crude-gap'
import { buildEiaEnergyDataset } from './server/eia-energy'
import { buildEiaElectricitySpreadDataset } from './server/eia-electricity-spread'
import { buildEiaFossilGenerationDataset, buildEiaGenerationDataset } from './server/eia-generation'
import { buildEiaDieselDataset, buildEiaGasDataset } from './server/eia-gas'
import { buildEiaNaturalGasDataset } from './server/eia-natural-gas'
import { buildEiaHeatingOilDataset, buildEiaPropaneDataset } from './server/eia-weekly-fuels'

const distDir = join(import.meta.dir, 'dist')
const port = Number(process.env.PORT ?? 3000)
const cacheTtlMs = Number(process.env.EIA_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000)
const datasetCache = new Map<string, { expiresAt: number; payload: unknown }>()

const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true })
    }

    if (url.pathname.startsWith('/api/datasets/')) {
      const datasetId = url.pathname.split('/').pop() ?? ''

      return getDataset(datasetId)
    }

    return serveStatic(url.pathname)
  },
})

console.log(`BeyondAverage listening on http://localhost:${port}`)

async function getDataset(datasetId: string) {
  const cached = datasetCache.get(datasetId)

  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  }

  try {
    const payload = await buildDatasetPayload(datasetId)
    datasetCache.set(datasetId, { expiresAt: Date.now() + cacheTtlMs, payload })

    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown dataset fetch error'

    return Response.json(
      {
        error: message,
        fallback: 'No dataset values are returned when the source is unavailable.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

function buildDatasetPayload(datasetId: string) {
  if (datasetId === 'gas') {
    return buildEiaGasDataset()
  }
  if (datasetId === 'income') {
    return buildCensusDataset('income')
  }
  if (datasetId === 'housing') {
    return buildCensusDataset('housing')
  }
  if (datasetId === 'energy') {
    return buildEiaEnergyDataset()
  }
  if (datasetId === 'diesel') {
    return buildEiaDieselDataset()
  }
  if (datasetId === 'natgas') {
    return buildEiaNaturalGasDataset()
  }
  if (datasetId === 'generation') {
    return buildEiaGenerationDataset()
  }
  if (datasetId === 'heatingoil') {
    return buildEiaHeatingOilDataset()
  }
  if (datasetId === 'propane') {
    return buildEiaPropaneDataset()
  }
  if (datasetId === 'elecspread') {
    return buildEiaElectricitySpreadDataset()
  }
  if (datasetId === 'crudegap') {
    return buildEiaCrudeGapDataset()
  }
  if (datasetId === 'fossilgrid') {
    return buildEiaFossilGenerationDataset()
  }

  throw new Error(`Unknown dataset: ${datasetId}`)
}

async function serveStatic(pathname: string) {
  const decodedPath = decodeURIComponent(pathname.split('?')[0] ?? '/')
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^[/\\]+/, '')
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, '')
  const filePath = join(distDir, safePath)
  const resolvedPath = existsSync(filePath) && statSync(filePath).isFile() ? filePath : join(distDir, 'index.html')
  const extension = extname(resolvedPath)
  const body = await readFile(resolvedPath)

  return new Response(body, {
    headers: {
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
    },
  })
}
