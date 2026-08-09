# One image, one process: the REST API, the MCP endpoint, the SSE stream and the
# built canvas. They are not separable — the run in flight, the 500-event replay
# buffer and the x402 self-call all live in a single process (see fly.toml).

FROM node:22-alpine AS build
WORKDIR /app

# Root deps and sources first: the canvas imports the event contract from ../src
# through the @shared alias, so the BACKEND sources must be present to build the
# FRONTEND. Copying manifests before sources keeps the install layer cached.
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src

# The canvas's `shoot` script uses playwright, whose postinstall downloads ~400MB
# of browsers we never run here.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci
COPY web ./web
RUN npm --prefix web run build


FROM node:22-alpine AS runtime
WORKDIR /app

# --include=dev is deliberate: tsx runs the TypeScript directly, so there is no
# backend build step and what deploys is exactly what runs locally. NODE_ENV is
# set AFTER the install, because npm reads it as --omit=dev and would drop tsx.
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force
ENV NODE_ENV=production

COPY tsconfig.json ./
COPY src ./src
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3000
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
