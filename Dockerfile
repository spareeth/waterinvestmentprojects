# syntax=docker/dockerfile:1
# Production image for Water Investment Projects (M8). Built on the server by compose.production.yml.
# Targets:
#   runner  the web app (Next.js standalone server), runs as the unprivileged "node" user
#   tools   full source and dependencies, for one-off jobs: database migrations, first admin, staging seed

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# openssl and CA certificates for Prisma's migration engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs "prisma generate" (client in src/generated/prisma).
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------------------------------------------
FROM deps AS build
COPY . .
# Public settings baked into pre-rendered pages and the security headers (see .env.production.example).
ARG APP_NAME
ARG APP_URL
ARG SUPPORT_EMAIL
ARG INVESTOR_ACK_VERSION
ARG INVESTOR_ACK_TEXT
ENV APP_NAME=${APP_NAME} \
    APP_URL=${APP_URL} \
    SUPPORT_EMAIL=${SUPPORT_EMAIL} \
    INVESTOR_ACK_VERSION=${INVESTOR_ACK_VERSION} \
    INVESTOR_ACK_TEXT=${INVESTOR_ACK_TEXT}
# Some route modules validate the environment when Next.js loads them to collect page data. The build connects to
# nothing, so placeholders are enough; they are set for this one command only and never stored in an image.
RUN mkdir -p public \
  && DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
     BETTER_AUTH_SECRET="build-time-placeholder-not-a-secret-000000" \
     npm run build

# ---------------------------------------------------------------------------------------------------------------
FROM build AS tools
ENV NODE_ENV=production \
    STORAGE_LOCAL_DIR=/app/.data/blobs
# Same owner as in the runner, so files a job writes into the shared uploads volume stay readable by the app.
RUN mkdir -p /app/.data/blobs && chown -R node:node /app/.data
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_DIR=/app/.data/blobs
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Uploaded teasers live here (a named volume in compose.production.yml).
RUN mkdir -p /app/.data/blobs && chown -R node:node /app/.data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
