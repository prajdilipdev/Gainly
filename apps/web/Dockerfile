# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root=false || npm install --workspace apps/web

COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npx next build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
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
