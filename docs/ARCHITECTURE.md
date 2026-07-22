# Architecture

## Monorepo layout

```
apps/
├── api/          NestJS backend (REST, port 4000)
│   ├── prisma/   Schema + SQL migrations
│   └── src/
│       ├── auth/           JWT issuance, refresh rotation, logout
│       ├── users/          Profile management
│       ├── portfolios/     Portfolio CRUD + ownership checks
│       ├── transactions/   Ledger CRUD, oversell validation
│       ├── analytics/      Holdings engine (FIFO), XIRR/CAGR, summaries
│       ├── market-data/    Yahoo Finance quotes/history/search/FX + caching
│       ├── watchlists/     Watchlist CRUD with live quotes
│       ├── alerts/         Alert CRUD + cron evaluator
│       ├── notifications/  In-app notification store
│       ├── import/         Parsers, column auto-mapper, preview/commit
│       ├── export/         CSV / Excel / PDF / JSON generation
│       ├── cache/          Redis abstraction with in-memory fallback
│       ├── prisma/         PrismaService (connection lifecycle)
│       ├── common/         Guards, decorators, exception filter
│       └── config/         Environment validation (fails fast on boot)
└── web/          Next.js frontend (port 3000)
    └── src/
        ├── app/            App Router pages ((auth) and (app) groups)
        ├── components/     shadcn/ui primitives + feature components
        ├── hooks/          TanStack Query data hooks
        └── lib/            API client, types, formatters
```

## Clean-architecture mapping

Each Nest module keeps three concerns separated:

- **Controllers** — HTTP transport only: parse/validate input (class-validator DTOs, whitelist mode), delegate, shape output. No business logic.
- **Services** — use-cases and business rules (ownership checks, oversell validation, token rotation). Depend on PrismaService and other services via DI.
- **Domain logic** — pure, framework-free functions where the real complexity lives, unit-tested in isolation:
  - `analytics/holdings.engine.ts` — replays a transaction ledger into holdings using FIFO lots; handles splits and dividends.
  - `analytics/xirr.ts` — Newton–Raphson XIRR with bisection fallback, plus CAGR.
  - `import/column-mapper.ts` — header-synonym + value-heuristic column detection, tolerant number/date parsing.
  - `import/parsers.ts` — CSV/TSV/Excel/JSON/pasted-text → uniform 2D table.

Cross-cutting concerns are global: `JwtAuthGuard` (every route is authenticated unless marked `@Public()`), `ThrottlerGuard` (rate limiting), `HttpExceptionFilter` (uniform error envelope, no internal leakage), `ValidationPipe` (whitelist + transform).

## Data flow: portfolio summary

1. Client calls `GET /analytics/portfolios/:id/summary` (auto-refetched every 30 s by TanStack Query).
2. `AnalyticsService` verifies ownership, loads the transaction ledger.
3. `computeHoldings()` replays the ledger → per-symbol quantity, FIFO cost basis, realized P&L, dividends.
4. `MarketDataService.getQuotes()` resolves live prices — each quote served from Redis (30 s TTL) or fetched from Yahoo and cached; failures fall back to a 24 h stale copy.
5. USD/INR spot rate converts positions into the portfolio base currency.
6. XIRR is computed from the actual dated cash flows plus current value as the terminal flow.

## Market data & symbol mapping

App symbols are stored bare (`RELIANCE`, `AAPL`) with an `exchange` enum. The Yahoo ticker is derived at the edge: NSE → `.NS` suffix, BSE → `.BO`, US symbols unchanged. Search results are filtered to the four supported exchanges via Yahoo exchange codes (NYQ/NMS/NGM/NCM/ASE/NSI/BSE).

Cache TTLs: quotes 30 s, history 15 min, search 24 h, FX 5 min — plus long-lived `stale:` copies used when Yahoo is unreachable, so dashboards degrade gracefully instead of erroring.

## Import engine

```
file/text ─▶ parseBuffer/parseText ─▶ RawTable (string[][])
                                        │
                       detectColumns    ▼
             (header synonyms → value heuristics → qty/price disambiguation)
                                        │
                          mapRows       ▼
        (tolerant parsing, derivations: price=amount/qty, exchange from
         .NS/.BO or currency, negative qty → SELL; per-row errors/warnings)
                                        │
             preview JSON ◀─────────────┘
                 │  user adjusts mapping → POST /import/remap (recompute)
                 ▼
       POST /import/portfolios/:id/commit  (server-side re-validation,
                                            single createMany transaction)
```

The client never decides validity on its own: commit re-validates every row server-side and rejects the batch with per-row errors if anything fails.

## Alerts pipeline

A cron job (`@nestjs/schedule`, every minute, re-entrancy guarded) loads ACTIVE alerts, resolves quotes through the shared cache (deduplicated per symbol), flips triggered alerts to TRIGGERED, and writes an in-app notification. The web app polls notifications (30 s), shows them in the bell menu, and mirrors new ones to the browser Notification API when permitted.

## Security model

- Passwords: bcrypt (12 rounds); login always runs a hash compare to avoid user-enumeration timing.
- Access tokens: 15 min, `Authorization: Bearer`, kept in sessionStorage (same-origin proxy avoids cross-site exposure).
- Refresh tokens: 7 days, httpOnly `SameSite=Lax` cookie scoped to `/api/v1/auth`, stored **hashed** (SHA-256) server-side, rotated on every refresh; reuse of a revoked token revokes the whole session family.
- Every portfolio/watchlist/alert access re-checks ownership; cross-user access returns 403.
- Validation: global whitelist ValidationPipe (unknown fields rejected), UUID-validated route params, bounded numeric ranges, 10 MB / 10 k-row import limits.
- Headers: Helmet on the API; CSP-adjacent headers (frame deny, nosniff, referrer policy) on the web app.
- Rate limiting: 300 req/min general, 10 req/min on auth endpoints.
- Errors: uniform envelope; stack traces logged server-side, never returned.

## Scalability notes

- The API is stateless (JWT + Redis) — scale horizontally behind a load balancer; Redis makes the quote cache shared across instances.
- The alert cron should run on a single instance (or be moved to a dedicated worker / distributed lock) when scaling out.
- Heavy analytics are O(transactions) in memory per request; per-portfolio ledgers in the thousands are effectively instant. Indexes cover the hot paths (`portfolioId+symbol`, `portfolioId+executedAt`, alert status).
