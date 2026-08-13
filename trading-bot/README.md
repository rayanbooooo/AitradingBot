# AI Trading Bot Dashboard

An autonomous market scanner, signal engine, risk manager, and Binance execution
system with a real-time React dashboard.

**Read "Important: what this is and isn't" below before you put real money behind
this.**

---

## Architecture at a glance

```
                 ┌─────────────────────────┐
Binance market   │        Backend           │
data (REST + WS) │  (Node.js, runs 24/7)    │
 ───────────────▶│                          │
                  │  Scanner → Indicators    │
                  │  → SMC patterns → Scorer │
                  │       │                  │
                  │       ▼                  │      WebSocket (live push)
TradingView       │  Risk Manager gate       │◀────────────────────────────┐
Pine Script       │       │                  │                              │
alert  ─webhook──▶│       ▼                  │                              │
                  │  [Manual approval?] ──▶  Approval queue                 │
                  │       │                  │                       ┌──────┴──────┐
                  │       ▼                  │                       │  React      │
                  │  Execution Engine        │──REST API────────────▶│  Dashboard  │
                  │  (Binance Futures API)   │                       └─────────────┘
                  │       │                  │
                  │       ▼                  │
                  │  Position Monitor        │
                  │  (trailing stop, 24h     │
                  │   time decay)            │
                  │       │                  │
                  │       ▼                  │
                  │  SQLite (signals,        │
                  │  trades, event log)      │
                  └─────────────────────────┘
```

- **backend/** — Node.js service. Scans the market, scores signals, enforces
  risk rules, executes orders, monitors open positions, and serves a REST +
  WebSocket API. Meant to run continuously (`pm2`, `systemd`, a container,
  whatever you already use for long-running Node processes).
- **frontend/** — Vite + React dashboard. Talks to the backend over REST for
  actions and WebSocket for live updates.

---

## Answering your question: how does execution actually work?

**TradingView does not execute trades.** It's a charting/alerting product.
The only thing it can do toward "executing a trade" is fire a webhook (an
HTTP request) when a Pine Script alert condition is met — and only if you've
built something on the other end to receive that webhook and act on it. It
does not have a general-purpose market-data API for third-party bots to pull
from, either.

So this system does not "connect to TradingView" for its core loop. Instead:

1. **Market data and indicator computation come directly from Binance** —
   the same exchange that executes the trades, so the price the bot analyzes
   is guaranteed to match the price it can actually trade at.
2. **TradingView is wired in as an optional secondary input**: `backend/src/webhook/tradingviewWebhook.js`
   exposes `POST /webhook/tradingview`. If you build a Pine Script strategy
   and set a TradingView alert to POST to that URL, its signals flow into
   the exact same risk-gating and (if enabled) manual-approval pipeline as
   scanner-generated signals. It is not a shortcut around any safety check.
3. **Binance is the broker.** "Log into a broker" means: create a Binance
   API key (Account → API Management), restrict it appropriately (see
   below), and put it in `backend/.env`. The bot uses that key to place and
   manage orders directly against Binance's API. Nothing about a Binance
   *login* by itself lets any bot trade — only an API key does that.

---

## Important: what this is and isn't

- You told the setup assistant you want **live, fully autonomous execution
  with no manual click required**, and Binance as the broker. This build
  supports that, but it ships with **`LIVE_TRADING_ENABLED=false` by
  default** and `USE_TESTNET=true` by default. You have to deliberately edit
  `.env` and restart the backend to arm live trading — that's not this
  assistant second-guessing you, it's literally the "require restart to
  enable live trading (not just toggle)" requirement from your own original
  spec, which this build treats as non-negotiable alongside the rest of
  your mandatory risk-management list (2% risk/trade, max 3 positions,
  daily/weekly drawdown halts, 3-loss cooldown, emergency stop).
- **Binance Spot cannot open SHORT positions** (you can't sell an asset you
  don't hold without margin). To honor "auto-execute LONG and SHORT" as
  written, execution uses **Binance USDⓈ-M Futures** instead of Spot. Futures
  behaves differently from spot in ways that matter: it has **liquidation
  risk** (your position can be force-closed by the exchange before your own
  stop-loss triggers, in fast moves or if margin runs low) and **funding
  rate** fees that accrue periodically. Leverage is pinned to **1x by
  default** (`FUTURES_LEVERAGE` in `.env`) specifically to keep the economic
  risk close to what a spot bot would take — but liquidation and funding
  mechanics exist even at 1x. Read Binance's futures documentation before
  enabling live trading.
- **Scope note:** your original spec listed forex, crypto, stocks, and
  commodities. There is no execution path from this bot to forex/stocks/
  commodities through Binance, so the scanner is Binance-crypto-only. If you
  want forex or stocks executed too, that requires a second broker
  integration (e.g. OANDA) — deliberately left out of this build so the
  broker choice you actually gave (Binance) works correctly.
- **SMC pattern detection is heuristic**, not a reconstruction of real
  institutional order flow (that requires Level 2/footprint data Binance's
  public API doesn't expose). Treat order blocks / FVGs / liquidity sweeps
  here as reasonable rule-based approximations of the concepts, not ground
  truth.
- **This has not been run against real funds by anyone.** It has been
  syntax-checked, dependency-installed, and boot-tested end to end (REST
  API, WebSocket server, SQLite, risk calculator) in this environment, which
  has no outbound access to Binance to test order placement live. **Run it
  on `USE_TESTNET=true` for at least several days and watch it trade with
  fake funds before ever setting `LIVE_TRADING_ENABLED=true`.**

---

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- Testnet keys (recommended to start): log into your regular Binance.com
  account, switch to **Demo Trading** (top nav, next to Spot/Futures), then
  create an API key from API Management while in that mode. Binance retired
  the old separate testnet.binancefuture.com sandbox (GitHub-login based) --
  Demo Trading through your real account is what replaced it, and it's what
  this bot's `USE_TESTNET=true` now points at.
- Real keys (only once you're ready to risk real money): Account → API
  Management on your normal account. Either way, enable **Futures** trading
  on the key (required for SHORT support) and do **not** enable withdrawals.
- Leave `LIVE_TRADING_ENABLED=false` until you've watched the bot run on
  Demo Trading.

```bash
npm start
```

This starts:
- REST API on `:4000`
- WebSocket push server on `:4001`
- The scanner, which begins 5 minutes after boot (per spec) and re-scans all
  50 symbols on every 5-minute candle close
- The position monitor (trailing stops, 24h time-decay close), polling every
  15s

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`). It proxies
`/api` to `http://localhost:4000` (see `vite.config.js`) and connects to the
WebSocket server directly on `:4001`.

For a production build: `npm run build`, then serve `frontend/dist/` with
any static file server (nginx, Caddy, `serve`, etc.) alongside the backend.

### 3. Going live (only after testnet validation)

1. Get real Binance API keys (Futures trading enabled, withdrawals disabled).
2. In `backend/.env`: set `USE_TESTNET=false`, `BINANCE_API_KEY`/`BINANCE_API_SECRET`
   to the real keys, and `LIVE_TRADING_ENABLED=true`.
3. Restart the backend process. The startup log will print a loud warning
   confirming live mode is active.
4. Decide your manual-approval stance from the dashboard's Settings panel
   (default: manual approval **on**). Turning it off is what makes execution
   fully autonomous, per what you asked for — do this deliberately, not by
   default.

### 4. Connecting a hosted frontend (e.g. the Vercel preview) to a real backend

The Vercel deployment is a **static site with no backend behind it** — that's
why it shows sample data. To make that same hosted link show real charts and
real numbers, the backend needs to run somewhere that (a) stays up 24/7 and
(b) is reachable over **HTTPS/WSS**, not plain HTTP/WS — a page served over
`https://` (which Vercel always uses) is blocked by the browser from calling
a plain `http://` API or opening a plain `ws://` socket ("mixed content").

Two ways to get there:

**A. Run everything locally first (fastest, no hosting needed).** This is
the quickest way to see real charts and real numbers — no money at risk if
you're on testnet:
```bash
cd backend && npm install && cp .env.example .env   # fill in Binance keys
npm start
# in a second terminal:
cd frontend && npm install && npm run dev
```
Open the local Vite URL. It talks to `localhost:4000`/`:4001` automatically
(`vite.config.js`'s dev proxy + same-hostname WS default) — nothing to
configure. This uses real Binance market data and, once you add API keys,
real testnet account numbers. The Vercel link stays on sample data; this
local one is the "real" dashboard until you host the backend somewhere.

**B. Host the backend somewhere persistent, then point Vercel at it.** Pick
a host that gives you a `https://` URL out of the box (Railway, Render,
Fly.io, or your own VPS behind Caddy/nginx with a free Let's Encrypt cert —
plain "rent a VPS and run `npm start`" is not enough by itself, it also
needs TLS in front of it). Once the backend has a public `https://` +
matching `wss://` address:
1. In the Vercel project's environment variables, set:
   - `VITE_API_BASE` = `https://your-backend-host/api`
   - `VITE_WS_URL` = `wss://your-backend-host` (or wherever the WS server is exposed)
2. Redeploy the frontend (these are build-time Vite env vars, so a plain
   restart isn't enough — needs a rebuild).
3. The hosted dashboard will now show the same live data as a local run.

I can't provision a VPS or a Railway/Render account for you — that needs an
account and payment method only you control — but tell me which host you'd
rather use and I'll write the exact deploy config (Dockerfile, Railway/Render
service config, or an nginx+Caddy reverse proxy setup) for it.

---

## Risk management (enforced in `src/risk/riskManager.js` + `src/state.js`)

| Rule | Where enforced |
|---|---|
| Max 2% of account risked per trade | `riskManager.computePositionSize` — position size = (Account × Risk%) / Stop distance |
| Max 3 concurrent positions | `riskManager.evaluateGate` |
| -5% daily drawdown halts new entries | `state.updateBalance` sets `dailyHalted`; gate checks it |
| -10% weekly drawdown pauses new entries | Same mechanism, weekly window |
| 1h cooldown after 3 consecutive losses | `state.recordTradeResult` |
| Emergency stop closes everything instantly | `POST /api/emergency-stop` → `executionEngine.emergencyCloseAll` |
| Manual approval toggle | `POST /api/settings/manual-approval`, live-togglable from the dashboard |
| Live trading requires restart | `LIVE_TRADING_ENABLED` is read once at process boot from `.env`, not exposed as a runtime toggle anywhere in the API or UI |
| Connection-drop safety | `process.on('uncaughtException', ...)` in `index.js` triggers `emergencyCloseAll` |

Halts above stop *new entries*; they don't forcibly close positions already
open (those still ride their own stop-loss/take-profit/trailing-stop/time-decay
exits). Only the emergency stop button and the connection-drop handler close
everything immediately.

---

## Signal scoring

`src/signals/scorer.js` combines, per symbol, per 5-minute close:
- Higher-timeframe trend alignment (1h/4h/1d SMA20 vs SMA50) — up to 20 pts
- RSI — up to 15 pts
- MACD crossover/histogram — up to 15 pts
- Bollinger Band position — up to 10 pts
- SMC confluence (order blocks, fair value gaps, liquidity sweeps) — up to 25 pts
- Support/resistance cluster proximity — up to 15 pts

A signal only fires if score ≥ `MIN_SIGNAL_SCORE` (default 65) **and**
risk/reward ≥ `MIN_RISK_REWARD_RATIO` (default 2:1). Stop-loss is
ATR-based; take-profit targets 2.5–3:1 depending on score.

---

## Data & logging

- SQLite at `backend/data/trading.db` — `signals`, `trades`, `event_log` tables.
- `backend/logs/app.log` / `error.log` — plain-text logs.
- `GET /api/export/csv` — downloads closed trade history as CSV.
- `GET /api/metrics` — win rate, avg win/loss, win/loss ratio, total P&L, ROI,
  monthly P&L breakdown.

---

## Desktop notifications

`src/notifications/notifier.js` tries `node-notifier`, which needs a real OS
notification daemon (fails silently on a headless server/container — this is
expected, not a bug). The dashboard also requests browser Notification
permission and fires native browser notifications for new signals and fills
(`frontend/src/useWebSocket.js`) — that's the channel that actually works
when the backend runs on a server.

---

## Extending

- **Add another broker** (e.g. OANDA for forex): implement the same function
  surface as `src/exchange/binanceClient.js` (getKlines, getPrice, market
  order, stop order, symbol filters) and branch on it in
  `executionEngine.js`.
- **Add symbols**: edit `src/market/symbols.js`.
- **Change risk parameters**: all in `backend/.env`, no code changes needed.
