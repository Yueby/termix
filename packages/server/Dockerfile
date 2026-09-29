# The build context is the repository root, not packages/server: the lockfile and the
# workspace manifest live there, and pnpm resolves the workspace importers from them.
# docker-compose.yml sets that context.
FROM node:22-slim AS base
RUN corepack enable pnpm
WORKDIR /app

FROM base AS build
# Manifests first, so the dependency install is cached independently of the source.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter @termix/server...
COPY packages/server packages/server
RUN pnpm --filter @termix/server build

FROM base AS runtime
ENV NODE_ENV=production
# Installing production dependencies into the same workspace layout, rather than copying
# node_modules out of the build stage, keeps pnpm's symlinks pointing at things that exist.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --prod --filter @termix/server...
COPY --from=build /app/packages/server/dist packages/server/dist
# Shipped because the server applies migrations on startup: a fresh container that started
# with an empty database would fail its first sync request instead of creating the table.
COPY packages/server/drizzle packages/server/drizzle

RUN mkdir -p /app/data
ENV DB_PATH=/app/data/termix.db
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]

WORKDIR /app/packages/server
CMD ["node", "dist/server.js"]
