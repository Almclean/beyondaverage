# BeyondAverage

A first-pass Bun + React dashboard for showing skew-aware U.S. economic statistics: mean, median, mode, p95, p99, distributions, geographic medians, trends, and data-source context.

The app loads gasoline, diesel, residential electricity, residential natural gas, and renewable grid-share data through EIA, and income and home-price distributions through Census ACS. If a live source is unavailable, the app shows an explicit no-data state instead of placeholder values.

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

The container runs a small Bun server. It serves the built frontend and fetches source data through `/api/datasets/:id` using runtime environment secrets where needed. The browser never receives the API key.

Useful environment variables:

```env
EIA_API_KEY=your_key_here
EIA_CACHE_TTL_MS=21600000
PORT=3000
```

## Current MVP surface

- Retail gasoline, diesel, household income, home prices, residential electricity, residential natural gas, and renewable grid-share datasets
- Mean/median/mode/p95/p99 hero cards
- Distribution and trend charts with ECharts
- State choropleth maps
- CSV/JSON downloads
- Dark/light theme toggle
