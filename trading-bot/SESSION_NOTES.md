# Session Notes — AI Trading Bot Dashboard

Read this before doing anything else if you're picking this project back up
in a fresh conversation. `README.md` in this same folder is the technical
reference (architecture, setup, API); this file is the "what actually
happened and why" context that doesn't live in code comments.

## What this is

A Binance Futures (USDS-M) trading bot: Node.js backend that scans ~50
symbols, scores signals (RSI/MACD/BB/SMC confluence), executes via Binance's
Futures API, and a React dashboard (JARVIS/Iron-Man HUD visual style) with
an embedded TradingView chart, a manual trade ticket, live position
tracking, and safety controls. Repo: `rayanbooooo/Cloudcovenew`, branch
`claude/ai-trading-bot-dashboard-1w5w3x`. All code is committed and pushed —
nothing about the working system depends on any specific chat session.

## The person you're working with

Not a developer by background — needed step-by-step terminal walkthroughs
for everything (opening Terminal, installing Node/git, editing files via
`open -e`). Runs everything locally on a **Mac**, downloaded as a ZIP rather
than a git clone (their account has no admin rights, so some things like
reinstalling Xcode Command Line Tools aren't available to them — this is
*why* the backend uses Node's built-in `node:sqlite` instead of
`better-sqlite3`: the latter needs a native compile that failed on their
machine with no way to fix the toolchain).

**Critical working pattern**: you (whoever's reading this) cannot reach
their Mac directly. Every local step is: you give exact commands, they
paste them into Terminal, they paste back the output as text or a
screenshot, you diagnose from that. Expect several rounds per change. Don't
assume a fix worked until they confirm the actual output.

## Current live configuration (last confirmed)

- `USE_TESTNET=false`, `LIVE_TRADING_ENABLED=true` — **this is a real
  Binance account, real money**, not a sandbox.
- `MANUAL_APPROVAL_DEFAULT=true` — scanner/webhook-generated signals sit in
  an approval queue until clicked. The separate Manual Trade panel
  (dashboard sidebar) always executes instantly regardless of this setting
  — that's by design, not a bug (user explicitly asked for no confirmation
  step on manual trades).
- Binance Futures wallet balance was **$0.12** as of the last check —
  effectively unfunded. No real trade has actually executed yet; this has
  only been verified up to "the backend can read the real account balance,"
  not "an order has been placed and filled."
- Backend runs on `:4000` (REST) / `:4001` (WebSocket), frontend on `:5173`
  via Vite dev server, both started manually in separate Terminal tabs.
  Nothing is set up to survive a reboot or run unattended (no systemd/pm2
  service, no `screen`/`tmux`) — if their Mac restarts or Terminal closes,
  the bot stops until they manually run `npm start`/`npm run dev` again.

## Deliberate safety-rail changes (all explicit user requests, not bugs)

The original spec called several things "mandatory": 2% risk/trade, max 3
concurrent positions, daily/weekly drawdown halts, 3-loss cooldown,
emergency stop, and required stop-loss on every trade. Over the course of
the build, the user explicitly asked to relax some of these — each change
was flagged to them plainly before/while making it, not done silently:

- **Max concurrent positions: removed entirely.** No cap anywhere now.
- **Stop-loss/take-profit: optional on the Manual Trade panel only.** The
  automated scanner and TradingView webhook still always compute an
  ATR-based stop and ≥2:1 target — this only affects trades placed by hand.
  Consequence: auto risk-sizing (the 2% formula) can't size a position with
  no stop distance, so skipping the stop-loss forces manual quantity entry.
  A position with neither set has **no automatic downside protection at
  all** until the 24h time-decay close eventually flattens it — that
  setting (`POSITION_TIME_DECAY_HOURS`) is the only real safety net for a
  stop-less trade.
- **Manual trade execution: no confirmation dialog.** Clicking
  Execute LONG/SHORT fires immediately.

**Still fully enforced, not touched**: 2% risk/trade (when auto-sizing),
daily -5%/weekly -10% drawdown halts, 1h cooldown after 3 consecutive
losses, emergency stop (closes everything instantly), live-trading-requires-
restart (not a runtime toggle anywhere).

## Other notable technical decisions

- **Execution is Futures-only, not Spot** — Spot can't open SHORT positions.
  Leverage is pinned low (`FUTURES_LEVERAGE`, default 1x) deliberately.
- **Binance retired the old testnet.binancefuture.com sandbox** in favor of
  "Demo Trading" built into the regular Binance account (log in normally,
  switch to Demo Trading, create the API key from there). The bot's
  `USE_TESTNET=true` now points at `demo-fapi.binance.com` /
  `demo-fstream.binance.com` to match.
- **Market data and execution both read from the Futures API** (not a
  Spot/Futures mismatch) — this was a real bug caught and fixed mid-build.
- **Balance auto-syncs every 30s while LIVE** (`balancePoller.js`) — it used
  to only sync once at boot, which was stale/misleading; user caught this.
- **Chart is an embedded real TradingView widget** (their free public embed,
  not a lookalike) — gives the actual drawing toolbar (pen, fib, trendlines)
  the user asked for. Tradeoff accepted: it shows TradingView's own market
  data feed, so the bot's entry/stop/target lines can no longer be drawn
  directly on it (Active Trades panel is the source of truth for those
  instead). This was verified working via a screenshot from the user's own
  browser — could not be visually confirmed from the build sandbox itself
  (its network policy blocks TradingView's CDN, among other domains).
- **A Vercel deployment exists** as a **static preview only** — no live
  backend behind it, shows hardcoded sample data with a banner saying so.
  It is not connected to the user's real trading and doesn't need to be
  kept in sync for the bot to work; only touch it if the user asks about
  the hosted preview link specifically.

## Sandbox limitations worth knowing

The environment these changes were built/tested in has a restrictive
network egress policy — it cannot reach Binance's API, TradingView's CDN,
or several other domains. Every Binance-dependent code path has been
verified only up to "the network call gets attempted and fails correctly,"
never against a real response. Backend boot, DB layer (including nullable
stop-loss/take-profit columns), and the position-monitor's null-guard logic
*have* been exercised directly with stubbed/mocked data. Don't claim
something is "tested" against Binance without caveating that.

## If you're starting fresh

1. Read `README.md` for full architecture/setup.
2. Attach the repo (`rayanbooooo/Cloudcovenew`) if it isn't already.
3. Ask the user for their current `.env` settings via the safe grep pattern
   already established (never have them paste real key/secret values into
   chat — that happened once already and required revoking the key):
   ```
   grep -E '^(USE_TESTNET|LIVE_TRADING_ENABLED|MANUAL_APPROVAL_DEFAULT)=' .env
   ```
4. Ask what's changed since this file was written before assuming anything
   above is still current.
