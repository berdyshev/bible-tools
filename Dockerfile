# syntax=docker/dockerfile:1

# Production dependencies only.
FROM node:24.12-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Downloads the STEPBible files at the pinned revision and builds the database.
FROM node:24.12-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY scripts ./scripts
COPY src ./src
RUN pnpm data:fetch && pnpm data:build

FROM node:24.12-slim
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json LICENSE DATA-LICENSE.md ./
COPY src ./src
COPY --from=build /app/data/bible.sqlite ./data/bible.sqlite
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Run node directly so that signals reach it and its exit code is the container's.
CMD ["node", "--disable-warning=ExperimentalWarning", "src/http.ts"]
