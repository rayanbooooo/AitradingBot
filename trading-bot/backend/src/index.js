const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./logger');
const state = require('./state');
const { SYMBOLS } = require('./market/symbols');
const signalEngine = require('./signals/signalEngine');
const executionEngine = require('./execution/executionEngine');
const positionMonitor = require('./execution/positionMonitor');
const balancePoller = require('./execution/balancePoller');
const wsServer = require('./websocket/wsServer');
const { createApiRouter } = require('./api/routes');
const { createTradingViewWebhookRouter } = require('./webhook/tradingviewWebhook');
const { binance, futuresGetBalanceUsdt } = require('./exchange/binanceClient');

const SCAN_START_DELAY_MS = 5 * 60 * 1000; // "Start scanning 5 minutes after launch"

function assertSafeToBoot() {
  if (config.liveTradingEnabled && (!config.binance.apiKey || !config.binance.apiSecret)) {
    logger.error('LIVE_TRADING_ENABLED=true but BINANCE_API_KEY/SECRET are not set. Refusing to start.');
    process.exit(1);
  }
  if (config.liveTradingEnabled) {
    logger.warn('================================================================');
    logger.warn(' LIVE TRADING IS ENABLED. Real orders will be placed with real  ');
    logger.warn(' funds once a signal is approved (or auto-approved if manual    ');
    logger.warn(' approval is switched off). Flip LIVE_TRADING_ENABLED=false and ');
    logger.warn(' restart to go back to signal-only/paper mode.                  ');
    logger.warn('================================================================');
  } else {
    logger.info('Live trading is DISABLED (paper/signal-only mode). Set LIVE_TRADING_ENABLED=true in .env and restart to change this.');
  }
}

function scheduleDailyWeeklyResets() {
  let lastResetDay = new Date().getUTCDate();
  let lastResetWeek = getIsoWeek(new Date());
  setInterval(() => {
    const now = new Date();
    if (now.getUTCDate() !== lastResetDay) {
      lastResetDay = now.getUTCDate();
      state.resetDaily();
      logger.info('Daily P&L window reset');
    }
    const week = getIsoWeek(now);
    if (week !== lastResetWeek) {
      lastResetWeek = week;
      state.resetWeekly();
      logger.info('Weekly P&L window reset');
    }
  }, 60 * 1000);
}

function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${Math.ceil(((d - yearStart) / 86400000 + 1) / 7)}`;
}

function wireConnectionSafety() {
  // Spec requirement: "if connection drops, close all positions immediately."
  // node-binance-api's websocket layer auto-reconnects, but a hard error on
  // the underlying stream is treated as a connectivity failure worth
  // reacting to defensively rather than trading blind.
  if (binance && binance.websockets && typeof binance.websockets.userData === 'function') {
    // Placeholder hook point: wire a user-data-stream disconnect handler
    // here if you enable the authenticated user-data stream for live fills.
  }
  process.on('uncaughtException', async (err) => {
    logger.error('Uncaught exception -- treating as a connectivity/safety failure:', err.stack || err.message);
    await executionEngine.emergencyCloseAll(`Uncaught exception: ${err.message}`);
  });
  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled promise rejection:', err);
  });
}

async function syncLiveBalance() {
  if (!config.liveTradingEnabled) return;
  try {
    const realBalance = await futuresGetBalanceUsdt();
    state.initializeLiveBalance(realBalance);
  } catch (e) {
    logger.error(
      `Could not fetch real Futures balance at boot (falling back to STARTING_ACCOUNT_BALANCE_USDT=${config.account.startingBalanceUsdt}): ${e.message || e}`
    );
  }
}

async function main() {
  assertSafeToBoot();
  await syncLiveBalance();

  const app = express();
  app.use(cors());
  app.use('/api', createApiRouter());
  app.use('/webhook', createTradingViewWebhookRouter());
  app.get('/health', (req, res) => res.json({ ok: true, mode: state.liveTradingEnabled ? 'LIVE' : 'PAPER' }));

  app.listen(config.server.port, () => {
    logger.info(`REST API listening on :${config.server.port}`);
  });

  wsServer.start();
  positionMonitor.start();
  balancePoller.start();
  scheduleDailyWeeklyResets();
  wireConnectionSafety();

  logger.info(`Scanner will start in ${SCAN_START_DELAY_MS / 60000} minutes...`);
  setTimeout(() => {
    signalEngine.start(SYMBOLS, (signalRow) => executionEngine.executeSignal(signalRow));
  }, SCAN_START_DELAY_MS);
}

main().catch((e) => {
  logger.error('Fatal startup error:', e.stack || e.message);
  process.exit(1);
});
