const exchange = require('../exchange/binanceClient');
const { statements } = require('../db/db');
const config = require('../config');
const logger = require('../logger');
const executionEngine = require('./executionEngine');

const POLL_INTERVAL_MS = 15000;
const TRAILING_ACTIVATION_R = 1; // move stop to breakeven once price moves 1R in favor
const TRAILING_TRAIL_FRACTION = 0.5; // then trail the stop at 50% of additional favorable move

let timer = null;

async function checkTrade(trade) {
  let price;
  try {
    price = await exchange.getPrice(trade.symbol);
  } catch (e) {
    logger.warn(`Position monitor: price fetch failed for ${trade.symbol}: ${e.message || e}`);
    return;
  }

  const direction = trade.direction === 'LONG' ? 1 : -1;
  const hasStop = trade.stop_loss != null;
  const hasTarget = trade.take_profit != null;
  const originalRiskDistance = hasStop ? Math.abs(trade.entry_price - trade.stop_loss) : null;
  const favorableMove = (price - trade.entry_price) * direction;

  // --- Time decay: close regardless of P&L once the position is stale ---
  // This is the ONLY guaranteed exit for a position opened with no
  // stop-loss/take-profit (manual trades may skip both) -- until this
  // fires, such a position has no automatic downside protection at all.
  const ageHours = (Date.now() - new Date(trade.opened_at).getTime()) / (1000 * 60 * 60);
  if (ageHours >= config.risk.positionTimeDecayHours) {
    await executionEngine.closeTrade(trade, price, 'CLOSED_TIME_DECAY', `Open ${ageHours.toFixed(1)}h, past ${config.risk.positionTimeDecayHours}h time-decay limit`);
    return;
  }

  // --- Stop-loss / take-profit (skipped entirely if not set) ---
  // Paper trades have no broker enforcing these, so this loop is their only
  // exit mechanism. Live trades normally close via the broker-side
  // STOP_MARKET/TAKE_PROFIT_MARKET reduceOnly orders placed at entry; this
  // check is a redundant safety net in case that order is ever missed.
  const hitStop = hasStop && (direction === 1 ? price <= trade.stop_loss : price >= trade.stop_loss);
  const hitTarget = hasTarget && (direction === 1 ? price >= trade.take_profit : price <= trade.take_profit);
  if (hitStop) {
    await executionEngine.closeTrade(trade, price, 'CLOSED_SL', 'Stop-loss hit');
    return;
  }
  if (hitTarget) {
    await executionEngine.closeTrade(trade, price, 'CLOSED_TP', 'Take-profit hit');
    return;
  }

  // --- Trailing stop for winning trades (needs an original stop to trail from) ---
  if (hasStop && originalRiskDistance > 0 && favorableMove >= originalRiskDistance * TRAILING_ACTIVATION_R) {
    const trailDistance = originalRiskDistance * TRAILING_TRAIL_FRACTION;
    const candidateStop = price - direction * trailDistance;
    const improved = direction === 1 ? candidateStop > trade.stop_loss : candidateStop < trade.stop_loss;
    if (improved) {
      statements.setTrailing.run(candidateStop, trade.id);
      trade.stop_loss = candidateStop;
      logger.info(`Trailing stop updated for ${trade.symbol} -> ${candidateStop.toFixed(6)}`);

      if (trade.mode === 'LIVE') {
        // Replace the broker-side stop (and target, if one exists) at the new, tighter level.
        const closeSide = trade.direction === 'LONG' ? 'SELL' : 'BUY';
        try {
          await exchange.futuresCancelAll(trade.symbol);
          await exchange.futuresReduceOnlyStopOrder(trade.symbol, closeSide, trade.quantity, candidateStop, 'STOP_MARKET');
          if (hasTarget) {
            await exchange.futuresReduceOnlyStopOrder(trade.symbol, closeSide, trade.quantity, trade.take_profit, 'TAKE_PROFIT_MARKET');
          }
        } catch (e) {
          logger.error(`Failed to replace broker-side trailing stop for ${trade.symbol}: ${e.message || e}`);
        }
      }
    }
  }
}

async function tick() {
  const openTrades = statements.openTrades.all();
  for (const trade of openTrades) {
    await checkTrade(trade);
  }
}

function start() {
  if (timer) return;
  logger.info(`Position monitor started (polling every ${POLL_INTERVAL_MS / 1000}s)`);
  timer = setInterval(() => {
    tick().catch((e) => logger.error('Position monitor tick failed:', e.message || e));
  }, POLL_INTERVAL_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
