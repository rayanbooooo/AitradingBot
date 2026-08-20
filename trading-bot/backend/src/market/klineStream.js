const exchange = require('../exchange/binanceClient');
const { TIMEFRAMES, PRIMARY_TIMEFRAME } = require('./symbols');
const logger = require('../logger');

/** Fetches candle history for every scan timeframe for a single symbol. */
async function fetchMultiTimeframe(symbol) {
  const result = {};
  for (const tf of TIMEFRAMES) {
    try {
      result[tf] = await exchange.getKlines(symbol, tf, 200);
    } catch (e) {
      logger.warn(`Failed to fetch ${symbol} ${tf} candles:`, e.message || e);
      result[tf] = null;
    }
  }
  return result;
}

/**
 * Opens one combined websocket for the primary timeframe across every
 * symbol in the scan universe. Fires onCandleClose(symbol, candle) only
 * when Binance marks the candle final (k.x === true) -- this is what
 * drives "generate new signals every 5 minutes on new candle close".
 */
function subscribePrimaryCloses(symbols, onCandleClose) {
  logger.info(`Subscribing to ${PRIMARY_TIMEFRAME} kline stream for ${symbols.length} symbols`);
  return exchange.subscribeKlineStream(symbols, PRIMARY_TIMEFRAME, (candle) => {
    if (candle.isFinal) onCandleClose(candle.symbol, candle);
  });
}

module.exports = { fetchMultiTimeframe, subscribePrimaryCloses };
