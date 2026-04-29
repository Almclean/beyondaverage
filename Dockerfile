# syntax=docker/dockerfile:1

FROM oven/bun:1.3.13 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.3.13-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/server ./server
COPY --from=build /app/src/data.ts ./src/data.ts

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "const r=await fetch('http://127.0.0.1:3000/api/health'); if (!r.ok) process.exit(1)"

CMD ["bun", "run", "server.ts"]
