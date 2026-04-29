# HonestStats

A first-pass Bun + React dashboard for showing skew-aware U.S. economic statistics: mean, median, mode, p95, p99, distributions, geographic medians, trends, and data-source context.

Retail gasoline is loaded through a Bun API route using a server-side EIA key. If the live source is unavailable, the app shows an explicit no-data state instead of placeholder values.

## Run locally

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

## Docker

Build and run the production container:

```bash
docker build -t beyondaverage .
docker run --rm -p 8080:3000 --env-file .env beyondaverage
```

Then open `http://localhost:8080`.

The container runs a small Bun server. It serves the built frontend and fetches EIA data from `/api/datasets/gas` using `EIA_API_KEY` from the runtime environment. The browser never receives the API key.

Useful environment variables:

```env
EIA_API_KEY=your_key_here
EIA_CACHE_TTL_MS=21600000
PORT=3000
```

## Current MVP surface

- Retail gasoline, household income, home prices, and residential energy datasets
- Mean/median/mode/p95/p99 hero cards
- Distribution and trend charts with ECharts
- State median heat-map tiles
- ZIP/city/state search sample results
- CSV/JSON demo downloads
- Dark/light theme toggle
