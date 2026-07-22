# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace apps/api --include-workspace-root=false || npm install --workspace apps/api

COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npx nest build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/

WORKDIR /app/apps/api
EXPOSE 4000

# Apply migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
