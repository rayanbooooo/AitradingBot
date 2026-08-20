const Binance = require('node-binance-api');
const config = require('../config');
const logger = require('../logger');

const options = {
  APIKEY: config.binance.apiKey,
  APISECRET: config.binance.apiSecret,
  useServerTime: true,
  recvWindow: 10000,
  reconnect: true,
};

// Everything in this app -- market data AND execution -- runs on USDS-M
// Futures (see the "Why Futures, not Spot" note in execution engine), so the
// scanner reads the same futures order book it trades against. That matters:
// spot and futures prices for the same symbol are close but not identical,
// and mixing them would mean the bot scores signals against prices it can't
// actually execute at.
//
// Binance retired the old developer-only testnet.binancefuture.com sandbox
// (GitHub-login based) in favor of "Demo Trading", built into the regular
// binance.com account: log in with your normal Binance account, switch to
// Demo Trading, and create the API key from API Management while in that
// mode. Its REST/WS hosts (demo-fapi.binance.com / demo-fstream.binance.com)
// aren't hardcoded into node-binance-api@0.13.5 (it still defaults to the
// retired testnet.binancefuture.com), so they're overridden explicitly here.
if (config.binance.useTestnet) {
  options.urls = {
    fapi: 'https://demo-fapi.binance.com/fapi/',
    fstream: 'wss://demo-fstream.binance.com/stream?streams=',
    fstreamSingle: 'wss://demo-fstream.binance.com/ws/',
  };
  logger.info('Binance client configured for Futures DEMO TRADING (testnet)');
} else {
  logger.warn('Binance client configured for LIVE production Futures API');
}

const binance = new Binance().options(options);

/** Futures klines -- what the scanner scores signals against. */
async function getKlines(symbol, interval, limit = 200) {
  const ticks = await binance.futuresCandles(symbol, interval, { limit });
  return ticks.map((t) => ({
    openTime: t[0],
    open: parseFloat(t[1]),
    high: parseFloat(t[2]),
    low: parseFloat(t[3]),
    close: parseFloat(t[4]),
    volume: parseFloat(t[5]),
    closeTime: t[6],
  }));
}

/** Current futures mark-adjacent last price for one symbol. */
async function getPrice(symbol) {
  const data = await binance.futuresPrices({ symbol });
  const raw = data && typeof data === 'object' && 'price' in data ? data.price : data[symbol];
  return parseFloat(raw);
}

async function futuresGetSymbolFilters(symbol) {
  try {
    const info = await binance.futuresExchangeInfo();
    const s = info.symbols.find((x) => x.symbol === symbol);
    if (!s) throw new Error(`Unknown futures symbol ${symbol}`);
    const lotSize = s.filters.find((f) => f.filterType === 'LOT_SIZE');
    const priceFilter = s.filters.find((f) => f.filterType === 'PRICE_FILTER');
    const minNotional = s.filters.find((f) => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL');
    return {
      stepSize: lotSize ? parseFloat(lotSize.stepSize) : 0.001,
      tickSize: priceFilter ? parseFloat(priceFilter.tickSize) : 0.01,
      minNotional: minNotional ? parseFloat(minNotional.minNotional || minNotional.notional || 20) : 20,
    };
  } catch (e) {
    logger.warn(`Falling back to default symbol filters for ${symbol}: ${e.message}`);
    return { stepSize: 0.001, tickSize: 0.01, minNotional: 20 };
  }
}

/** Rounds a quantity down to the symbol's allowed step size. */
function roundStep(quantity, stepSize) {
  const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
  const factor = Math.pow(10, precision);
  return Math.floor(quantity * factor) / factor;
}

// ---------------------------------------------------------------------------
// USDⓈ-M Futures order placement -- used because Binance SPOT cannot open a
// SHORT position (you can't sell an asset you don't hold without margin).
// Futures lets both LONG and SHORT be opened as plain market orders. We pin
// leverage low (see config.futures.leverage, default 1x) specifically to
// avoid amplifying risk beyond the account's normal 2%-per-trade budget --
// but liquidation and funding-rate mechanics still apply and do not exist on
// spot, which is a real behavioral difference from a spot-only bot. See
// README "Why Futures, not Spot" for the full explanation.
//
// NOTE: node-binance-api's futures methods resolve as Promises when called
// without a trailing callback. Verify this against the exact version pinned
// in package.json before going live -- wrapper libraries around exchange
// APIs change method signatures across versions more often than the
// exchange API itself does.
// ---------------------------------------------------------------------------

async function futuresSetLeverage(symbol, leverage) {
  return binance.futuresLeverage(symbol, leverage);
}

async function futuresGetBalanceUsdt() {
  if (!config.binance.apiKey) return config.account.startingBalanceUsdt;
  const balances = await binance.futuresBalance();
  const usdt = balances.find((b) => b.asset === 'USDT');
  return usdt ? parseFloat(usdt.balance) : 0;
}

/** side: 'BUY' opens/adds LONG, 'SELL' opens/adds SHORT (on futures, selling first opens a short). */
async function futuresMarketOrder(symbol, side, quantity) {
  return side === 'BUY'
    ? binance.futuresMarketBuy(symbol, quantity)
    : binance.futuresMarketSell(symbol, quantity);
}

/** Places a reduceOnly stop/take-profit that only ever closes, never opens, a position. */
async function futuresReduceOnlyStopOrder(symbol, closeSide, quantity, stopPrice, type) {
  return binance.futuresOrder(symbol, closeSide, type, quantity, null, {
    stopPrice,
    reduceOnly: true,
  });
}

async function futuresCancelAll(symbol) {
  return binance.futuresCancelAll(symbol);
}

function subscribeKlineStream(symbols, interval, onCandle) {
  return binance.futuresCandlesticks(symbols, interval, (candle) => {
    const k = candle.k;
    onCandle({
      symbol: candle.s,
      interval: k.i,
      isFinal: k.x,
      openTime: k.t,
      closeTime: k.T,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
    });
  });
}

module.exports = {
  binance,
  getKlines,
  getPrice,
  roundStep,
  subscribeKlineStream,
  futuresSetLeverage,
  futuresGetBalanceUsdt,
  futuresMarketOrder,
  futuresReduceOnlyStopOrder,
  futuresCancelAll,
  futuresGetSymbolFilters,
};
