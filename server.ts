import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { buildEiaGasDataset } from './server/eia-gas'

const distDir = join(import.meta.dir, 'dist')
const port = Number(process.env.PORT ?? 3000)
const cacheTtlMs = Number(process.env.EIA_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000)
let gasCache: { expiresAt: number; payload: unknown } | null = null

const pendingDatasetConnectors: Record<string, { label: string; source: string }> = {
  income: { label: 'Household Income', source: 'Census ACS + BLS' },
  housing: { label: 'Home Prices', source: 'Census ACS + FHFA HPI' },
  energy: { label: 'Residential Energy', source: 'EIA Open Data API' },
}

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

      if (datasetId === 'gas') {
        return getGasDataset()
      }

      return getPendingDataset(datasetId)
    }

    return serveStatic(url.pathname)
  },
})

console.log(`BeyondAverage listening on http://localhost:${port}`)

async function getGasDataset() {
  if (gasCache && gasCache.expiresAt > Date.now()) {
    return Response.json(gasCache.payload, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  }

  try {
    const payload = await buildEiaGasDataset()
    gasCache = { expiresAt: Date.now() + cacheTtlMs, payload }

    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown EIA fetch error'

    return Response.json(
      {
        error: message,
        fallback: 'No dataset values are returned when the source is unavailable.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

function getPendingDataset(datasetId: string) {
  const dataset = pendingDatasetConnectors[datasetId]

  if (!dataset) {
    return Response.json(
      { error: `Unknown dataset: ${datasetId}` },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return Response.json(
    {
      id: datasetId,
      label: dataset.label,
      source: dataset.source,
      status: 'not_implemented',
      error: `${dataset.label} is not wired to ${dataset.source} yet. No values are displayed until the official source connector is implemented.`,
    },
    { status: 501, headers: { 'Cache-Control': 'no-store' } },
  )
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
