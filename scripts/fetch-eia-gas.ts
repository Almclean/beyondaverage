import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { buildEiaGasDataset } from '../server/eia-gas'

if (!process.env.EIA_API_KEY) {
  console.warn('Missing EIA_API_KEY. Skipping EIA fetch; no cache file was written.')
  process.exit(0)
}

const cache = await buildEiaGasDataset()
const outputPath = resolve('public/data/eia-gas-cache.json')

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')

console.log(`Wrote ${outputPath}`)
