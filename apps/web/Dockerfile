# ---- Build stage ----
FROM node:22-slim AS build
WORKDIR /app

# npm workspaces need every workspace's package.json present to resolve the
# root package-lock.json — a workspace-scoped `npm ci --workspace apps/web`
# was failing here even though the identical pattern works for the API
# image, so install the full monorepo (matching the working `build-and-test`
# CI job) and only build the web workspace below.
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY apps/web apps/web
WORKDIR /app/apps/web
# This app ships no static assets (the icon, robots.txt and sitemap are all
# App Router routes), so apps/web/public does not exist in the repo — and a
# COPY of a missing path is a hard Docker failure. Create it so the runtime
# stage's COPY works whether or not assets are added later.
RUN mkdir -p public && npx next build

# ---- Runtime stage ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app

# Next standalone output bundles its own node_modules
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
