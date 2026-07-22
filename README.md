# Gainly — Stock Portfolio Tracker

**Gainly** is a production-grade, multi-user stock portfolio manager for **US (NYSE/NASDAQ)** and **Indian (NSE/BSE)** equities.

| Layer    | Stack |
|----------|-------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Recharts |
| Backend  | NestJS 11, PostgreSQL + Prisma, Redis (ioredis), JWT auth with refresh-token rotation |
| Market data | Yahoo Finance (`yahoo-finance2`) with Redis-backed quote caching and stale-quote fallback |
| Ops      | Docker + docker-compose, GitHub Actions CI, Jest unit tests |

## Features

- **Accounts & security** — email/password auth (bcrypt), short-lived JWT access tokens, rotating refresh tokens stored hashed in Postgres and delivered as httpOnly cookies, token-reuse detection, rate limiting, Helmet, strict validation on every endpoint, per-user data isolation.
- **Portfolios & transactions** — multiple portfolios per user (USD or INR base), buy/sell/dividend/split transactions with fees, oversell protection, filters and pagination.
- **Live tracking & analytics** — auto-refreshing quotes, day change, unrealized/realized P&L (FIFO lot accounting), dividends, fees, **XIRR** (Newton–Raphson + bisection), **CAGR**, allocation by stock/exchange/currency, USD⇄INR conversion for mixed portfolios.
- **Charts** — interactive price history (1M–5Y) and allocation donuts, theme-aware.
- **Watchlists** — unlimited lists with live quotes, day and 52-week ranges.
- **Alerts** — price above/below and day-move % conditions, evaluated every minute server-side; in-app notification center plus browser notifications.
- **Search** — Yahoo-backed symbol autocomplete restricted to the four supported exchanges.
- **Intelligent import** — accepts CSV/TSV/Excel/JSON/pasted tables/broker exports in any layout; auto-detects headers and maps columns (30+ header synonyms per field plus value-shape heuristics); parses international number formats (₹1,23,456.78, `(120.5)`, European decimals), a dozen date formats, Excel serial dates, and epoch timestamps; infers exchange from `.NS`/`.BO` suffixes and currency; previews every row with errors/warnings; mapping is user-adjustable with live re-validation; server re-validates on commit.
- **Export** — holdings or full transaction ledger as CSV, Excel (styled + autofilter), PDF, or JSON.
- **UI** — responsive (mobile sidebar), light/dark/system theme, accessible components.

## Quick start (development)

Prerequisites: Node 20+, PostgreSQL 14+, optionally Redis.

```bash
npm install

# Configure the API
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env — set DATABASE_URL and both JWT secrets

# Create the schema
npm run prisma:generate
cd apps/api && npx prisma migrate deploy && cd ../..

# Run both apps (API :4000, web :3000)
npm run dev
```

Open http://localhost:3000, register an account, and create a portfolio or import data.

> Redis is optional in development — without `REDIS_URL` the API uses a bounded in-memory cache. Use Redis in production.

## Quick start (Docker)

```bash
cp .env.docker.example .env   # set strong secrets
docker compose up --build
```

This starts Postgres, Redis, the API (with automatic migrations), and the web app on http://localhost:3000.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run API + web in watch mode |
| `npm run build` | Production build of both apps |
| `npm test` | Jest unit tests (analytics engine, XIRR, import mapper) |
| `npm run prisma:migrate` | Apply migrations (`migrate deploy`) |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — layering, modules, data flow, caching, security model
- [API reference](docs/API.md) — every endpoint with request/response shapes
- [Deployment](docs/DEPLOYMENT.md) — Docker, environment variables, production hardening checklist

## Disclaimer

Market data is sourced from Yahoo Finance's public endpoints and may be delayed; this application is for personal portfolio tracking and does not provide investment advice.
