# ---- Build stage ----
# Tailwind v4's native binary (@tailwindcss/oxide / lightningcss) needs its
# musl (Alpine) build, which a workspace-scoped `npm ci` can fail to resolve
# correctly. node:22-slim (glibc, Debian-based) avoids that entirely.
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root=false || npm install --workspace apps/web

COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npx next build

# ---- Runtime stage ----
# Matches the build stage's glibc base so any native binaries traced into
# the standalone output run without a musl/glibc mismatch.
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
