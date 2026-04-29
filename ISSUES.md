# HonestStats Issues Backlog

These are local issue drafts. Once `gh` is configured, we can promote them to GitHub Issues.

## 1. Add Real U.S. Map Geometry

Replace the current state median tile grid with a real U.S. choropleth map.

Acceptance criteria:
- Render all 50 states plus D.C. using GeoJSON or TopoJSON.
- Color states by dataset median value.
- Show state name, median, and comparison to national median on hover/focus.
- Support keyboard-accessible state selection.
- Preserve the compact dashboard layout on mobile.

Notes:
- Good options: ECharts map support, `d3-geo`, or a lightweight SVG/GeoJSON component.
- Keep Alaska/Hawaii visible and readable.

## 2. Add True Violin + Box Plot Distribution View

Upgrade the distribution chart from histogram-only to a skew-focused violin/box plot view.

Acceptance criteria:
- Show median, mean, p95, and p99 markers.
- Include a histogram or density overlay for distribution shape.
- Add an accessible text summary for screen readers.
- Work across all MVP datasets with different units and scales.
- Avoid heavy bundle growth where possible.

Notes:
- ECharts can handle custom series, but Plotly may be faster for violin plots.
- If Plotly is used, lazy-load it so the initial dashboard bundle stays reasonable.

## 3. Add First Live EIA Connector With Cached Snapshots

Create the first real data connector for retail gasoline data using EIA Open Data.

Acceptance criteria:
- Add an EIA API client module.
- Read API key from environment variables.
- Cache fetched snapshots locally for development.
- Normalize live data into the existing `Dataset` object shape.
- Clearly display source date and cache freshness in the UI.
- Fall back to demo data when no API key or network is available.

Notes:
- Do not call EIA on every page render.
- Keep the data layer provider-agnostic so Census, BLS, and FHFA connectors can follow the same pattern.
