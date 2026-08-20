const config = require('../config');
const state = require('../state');
const logger = require('../logger');
const { futuresGetBalanceUsdt } = require('../exchange/binanceClient');

const POLL_INTERVAL_MS = 30000;

let timer = null;

/**
 * The boot-time balance sync (index.js) only reflects the account's state at
 * the moment the process started. Deposits, withdrawals, or funding fees
 * after that point would otherwise never show up until a restart. This
 * polls the real Futures balance periodically and pushes it through
 * state.updateBalance -- the same path a closed trade's P&L goes through --
 * so the dashboard, and the daily/weekly drawdown halts, stay grounded in
 * the account's actual state rather than a stale snapshot.
 *
 * Caveat: because this reads raw account balance rather than tracking
 * realized trade P&L separately, a manual deposit or withdrawal while the
 * bot is running will read as a P&L swing for the daily/weekly halt
 * calculation. That's a rare scenario (you generally don't move funds in
 * and out of a wallet a bot is actively trading from) and treating any
 * real balance drop as halt-worthy is arguably the safer default anyway.
 */
async function tick() {
  try {
    const realBalance = await futuresGetBalanceUsdt();
    if (realBalance !== state.accountBalance) {
      state.updateBalance(realBalance);
    }
  } catch (e) {
    logger.warn(`Balance poll failed: ${e.message || e}`);
  }
}

function start() {
  if (!config.liveTradingEnabled) return;
  if (timer) return;
  logger.info(`Live balance poller started (checking every ${POLL_INTERVAL_MS / 1000}s)`);
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
