# Deployment

## Docker Compose (single host)

```bash
cp .env.docker.example .env
# Set POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, COOKIE_SECRET
# to strong random values, and CORS_ORIGINS to your public web origin.

docker compose up --build -d
```

Services:

| Service | Port | Notes |
|---|---|---|
| web | 3000 | Next.js standalone server, proxies `/api/v1/*` to the API |
| api | 4000 | Runs `prisma migrate deploy` on boot |
| postgres | internal | Volume-backed (`pgdata`) |
| redis | internal | 256 MB LRU cache |

Put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front of the **web** service only — the API does not need public exposure since the frontend proxies it (remove the `api` port mapping in that case).

## Environment variables (API)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✔ | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | ✔ | ≥32 chars, random |
| `JWT_REFRESH_SECRET` | ✔ | ≥32 chars, random, different from access secret |
| `REDIS_URL` | recommended | Falls back to in-memory cache if absent |
| `PORT` | | Default 4000 |
| `CORS_ORIGINS` | | Comma-separated allowed origins |
| `COOKIE_SECRET` | | Cookie signing secret |

Environment validation runs at boot and refuses to start with missing/weak configuration.

## Environment variables (web)

| Variable | Description |
|---|---|
| `API_URL` | Internal URL of the API (e.g. `http://api:4000`) used by the rewrite proxy |

## Managed platforms

- **Web**: any Node host or container platform (the image uses Next.js standalone output). Vercel also works — set `API_URL` to your API's URL.
- **API**: any container platform (Fly.io, Railway, Render, ECS, Cloud Run). Provide Postgres (Neon, RDS, Supabase) and Redis (Upstash, Elasticache). Run migrations via the container entrypoint (already configured) or a release phase: `npx prisma migrate deploy`.

## Production checklist

- [ ] Strong unique values for both JWT secrets, cookie secret, and DB password
- [ ] TLS everywhere; the refresh cookie is `Secure` when `NODE_ENV=production`
- [ ] `CORS_ORIGINS` restricted to your exact public origin
- [ ] Postgres backups (volume snapshots or `pg_dump` schedule)
- [ ] Redis enabled (shared cache across API replicas)
- [ ] If running multiple API replicas: pin the alert cron to one instance or add a distributed lock
- [ ] Log aggregation for the API container (stdout JSON-friendly)
- [ ] Uptime monitoring on `GET /api/v1/health`

## Scaling out

The API is stateless. Scale replicas freely; sessions survive because refresh tokens live in Postgres and quotes in Redis. The alert scheduler is the only singleton concern (see checklist).
