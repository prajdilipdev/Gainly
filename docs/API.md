# API Reference

Base URL: `http://<host>:4000/api/v1`

All endpoints require `Authorization: Bearer <accessToken>` unless marked **public**. Errors use a uniform envelope:

```json
{ "statusCode": 400, "error": "BadRequest", "message": "…", "path": "/api/v1/…", "timestamp": "…" }
```

## Auth (public)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, name, baseCurrency? }` | Password: ≥8 chars with upper+lower+digit. Sets refresh cookie; returns `{ user, accessToken }` |
| POST | `/auth/login` | `{ email, password }` | Same response as register |
| POST | `/auth/refresh` | — (uses httpOnly cookie) | Rotates the refresh token; returns `{ accessToken }` |
| POST | `/auth/logout` | — | Revokes the refresh token, clears the cookie (204) |

Auth endpoints are rate-limited to 10 requests/minute per IP.

## Users

| Method | Path | Description |
|---|---|---|
| GET | `/users/me` | Profile + entity counts |
| PATCH | `/users/me` | `{ name?, baseCurrency? }` |

## Portfolios

| Method | Path | Description |
|---|---|---|
| GET | `/portfolios` | List own portfolios with transaction counts |
| POST | `/portfolios` | `{ name, description?, baseCurrency? }` |
| GET | `/portfolios/:id` | Single portfolio (404/403 enforced) |
| PATCH | `/portfolios/:id` | Partial update |
| DELETE | `/portfolios/:id` | Cascades to transactions |

## Transactions

Nested under `/portfolios/:portfolioId/transactions`.

| Method | Path | Description |
|---|---|---|
| GET | `/` | Query params: `symbol, type, exchange, from, to, limit (≤500), offset`. Returns `{ items, total }` |
| POST | `/` | See semantics below |
| PATCH | `/:id` | Partial update, re-validated |
| DELETE | `/:id` | |

Transaction semantics (`type`):

- `BUY` / `SELL` — `quantity` shares at `price` per share plus `fees`. Sells are rejected if they exceed the split-adjusted quantity held at `executedAt`.
- `DIVIDEND` — `price` is the **total cash amount** received (quantity ignored, use 1).
- `SPLIT` — `price` is the split multiplier (2 → 2-for-1); all open lots are adjusted.

`currency` defaults from the exchange (NSE/BSE → INR, else USD). `executedAt` must not be in the future.

## Market data

| Method | Path | Description |
|---|---|---|
| GET | `/market/search?q=` | Symbol/company autocomplete, only NYSE/NASDAQ/NSE/BSE results |
| GET | `/market/quote/:exchange/:symbol` | Live quote (30 s cache) |
| GET | `/market/quotes?symbols=NASDAQ:AAPL,NSE:INFY` | Batch quotes (≤100) |
| GET | `/market/history/:exchange/:symbol?range=1mo\|3mo\|6mo\|1y\|2y\|5y\|max` | OHLCV bars |
| GET | `/market/fx/usdinr` | Current USD/INR rate |

## Analytics

| Method | Path | Description |
|---|---|---|
| GET | `/analytics/dashboard` | Per-portfolio summaries for all portfolios |
| GET | `/analytics/portfolios/:id/summary` | Full summary: holdings enriched with live prices, unrealized/realized P&L, dividends, fees, day change, XIRR, CAGR, allocation breakdowns, USD/INR rate used |

## Watchlists

| Method | Path | Description |
|---|---|---|
| GET | `/watchlists` | List with item counts |
| POST | `/watchlists` | `{ name }` |
| GET | `/watchlists/:id` | Items enriched with live quotes |
| PATCH | `/watchlists/:id` | Rename |
| DELETE | `/watchlists/:id` | |
| POST | `/watchlists/:id/items` | `{ symbol, exchange, companyName? }` |
| DELETE | `/watchlists/:id/items/:itemId` | |

## Alerts & notifications

| Method | Path | Description |
|---|---|---|
| GET | `/alerts` | Own alerts |
| POST | `/alerts` | `{ symbol, exchange, condition, threshold, note? }` — condition: `ABOVE`, `BELOW`, `PCT_CHANGE_UP`, `PCT_CHANGE_DOWN` |
| PATCH | `/alerts/:id/status` | `{ status: ACTIVE\|DISABLED }` (re-arming clears `triggeredAt`) |
| DELETE | `/alerts/:id` | |
| GET | `/notifications?unread=true` | Latest 50 |
| POST | `/notifications/:id/read` | |
| POST | `/notifications/read-all` | |

## Import

| Method | Path | Description |
|---|---|---|
| POST | `/import/preview/file` | multipart `file` (CSV/TSV/XLSX/JSON/TXT, ≤10 MB) → preview |
| POST | `/import/preview/text` | `{ text }` — pasted table or JSON → preview |
| POST | `/import/remap` | `{ table, mapping, hasHeader }` → recomputed preview |
| POST | `/import/portfolios/:id/commit` | `{ rows: [...] }` — atomic bulk insert, all-or-nothing with per-row error details |

Preview shape:

```json
{
  "headers": ["Trade Date", "Action", …],
  "hasHeader": true,
  "mapping": { "0": "date", "1": "type", "2": null, … },
  "confidence": { "0": 1, … },
  "totalRows": 120, "validRows": 118, "errorRows": 2,
  "rows": [{ "index": 0, "raw": […], "parsed": { "symbol": "AAPL", … }, "errors": [], "warnings": [] }]
}
```

## Export

| Method | Path | Description |
|---|---|---|
| GET | `/export/portfolios/:id?format=csv\|xlsx\|pdf\|json&scope=holdings\|transactions` | File download with correct MIME type and `Content-Disposition` |

## Health (public)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ status, database, uptime, timestamp }` |
