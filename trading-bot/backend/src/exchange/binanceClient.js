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

// Market-data (klines, prices) works unauthenticated, so the scanner still
// runs even with no API keys configured. Testnet swaps every base URL to
// Binance's spot testnet, which serves real market data against fake funds.
if (config.binance.useTestnet) {
  options.urls = {
    base: 'https://testnet.binance.vision/api/',
    stream: 'wss://testnet.binance.vision/ws/',
    combineStream: 'wss://testnet.binance.vision/stream?streams=',
  };
  logger.info('Binance client configured for TESTNET');
} else {
  logger.warn('Binance client configured for LIVE production API');
}

const binance = new Binance().options(options);

async function getKlines(symbol, interval, limit = 200) {
  return new Promise((resolve, reject) => {
    binance.candlesticks(symbol, interval, (error, ticks) => {
      if (error) return reject(error);
      const candles = ticks.map((t) => ({
        openTime: t[0],
        open: parseFloat(t[1]),
        high: parseFloat(t[2]),
        low: parseFloat(t[3]),
        close: parseFloat(t[4]),
        volume: parseFloat(t[5]),
        closeTime: t[6],
      }));
      resolve(candles);
    }, { limit });
  });
}

async function getPrice(symbol) {
  return new Promise((resolve, reject) => {
    binance.prices(symbol, (error, ticker) => {
      if (error) return reject(error);
      resolve(parseFloat(ticker[symbol]));
    });
  });
}

async function getAccountBalanceUsdt() {
  if (!config.binance.apiKey) return config.account.startingBalanceUsdt;
  return new Promise((resolve, reject) => {
    binance.balance((error, balances) => {
      if (error) return reject(error);
      const usdt = balances.USDT ? parseFloat(balances.USDT.available) + parseFloat(balances.USDT.onOrder) : 0;
      resolve(usdt);
    });
  });
}

async function getSymbolFilters(symbol) {
  return new Promise((resolve, reject) => {
    binance.exchangeInfo((error, info) => {
      if (error) return reject(error);
      const s = info.symbols.find((x) => x.symbol === symbol);
      if (!s) return reject(new Error(`Unknown symbol ${symbol}`));
      const lotSize = s.filters.find((f) => f.filterType === 'LOT_SIZE');
      const priceFilter = s.filters.find((f) => f.filterType === 'PRICE_FILTER');
      const minNotional = s.filters.find((f) => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL');
      resolve({
        stepSize: lotSize ? parseFloat(lotSize.stepSize) : 0.00001,
        tickSize: priceFilter ? parseFloat(priceFilter.tickSize) : 0.01,
        minNotional: minNotional ? parseFloat(minNotional.minNotional || minNotional.minNotionalValue || 10) : 10,
      });
    });
  });
}

/** Rounds a quantity down to the symbol's allowed step size. */
function roundStep(quantity, stepSize) {
  const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
  const factor = Math.pow(10, precision);
  return Math.floor(quantity * factor) / factor;
}

async function placeMarketOrder(symbol, side, quantity) {
  return new Promise((resolve, reject) => {
    const cb = (error, response) => (error ? reject(error) : resolve(response));
    if (side === 'BUY') binance.marketBuy(symbol, quantity, cb);
    else binance.marketSell(symbol, quantity, cb);
  });
}

async function placeStopLossLimit(symbol, side, quantity, stopPrice, limitPrice) {
  return new Promise((resolve, reject) => {
    const params = { stopPrice, type: 'STOP_LOSS_LIMIT', timeInForce: 'GTC' };
    const cb = (error, response) => (error ? reject(error) : resolve(response));
    if (side === 'BUY') binance.buy(symbol, quantity, limitPrice, params, cb);
    else binance.sell(symbol, quantity, limitPrice, params, cb);
  });
}

async function placeTakeProfitLimit(symbol, side, quantity, stopPrice, limitPrice) {
  return new Promise((resolve, reject) => {
    const params = { stopPrice, type: 'TAKE_PROFIT_LIMIT', timeInForce: 'GTC' };
    const cb = (error, response) => (error ? reject(error) : resolve(response));
    if (side === 'BUY') binance.buy(symbol, quantity, limitPrice, params, cb);
    else binance.sell(symbol, quantity, limitPrice, params, cb);
  });
}

async function cancelOrder(symbol, orderId) {
  return new Promise((resolve, reject) => {
    binance.cancel(symbol, orderId, (error, response) => (error ? reject(error) : resolve(response)));
  });
}

// ---------------------------------------------------------------------------
// USDⓈ-M Futures -- used for execution because Binance SPOT cannot open a
// SHORT position (you can't sell an asset you don't hold without margin).
// Futures lets both LONG and SHORT be opened as plain market orders. We pin
// leverage low (see config.futures.leverage, default 1x) specifically to
// avoid amplifying risk beyond the account's normal 2%-per-trade budget --
// but liquidation and funding-rate mechanics still apply and do not exist on
// spot, which is a real behavioral difference from a spot-only bot. See
// README "Why Futures, not Spot" for the full explanation.
// ---------------------------------------------------------------------------

// NOTE: node-binance-api's futures methods resolve as Promises when called
// without a trailing callback (per the library's README examples). Verify
// this against the exact version pinned in package.json before going live --
// wrapper libraries around exchange APIs change method signatures across
// versions more often than the exchange API itself does.

async function futuresSetLeverage(symbol, leverage) {
  return binance.futuresLeverage(symbol, leverage);
}

async function futuresGetBalanceUsdt() {
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

async function futuresGetSymbolFilters(symbol) {
  return getSymbolFilters(symbol).catch(() => ({ stepSize: 0.001, tickSize: 0.01, minNotional: 20 }));
}

function subscribeKlineStream(symbols, interval, onCandle) {
  return binance.websockets.candlesticks(symbols, interval, (candle) => {
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
  getAccountBalanceUsdt,
  getSymbolFilters,
  roundStep,
  placeMarketOrder,
  placeStopLossLimit,
  placeTakeProfitLimit,
  cancelOrder,
  subscribeKlineStream,
  futuresSetLeverage,
  futuresGetBalanceUsdt,
  futuresMarketOrder,
  futuresReduceOnlyStopOrder,
  futuresCancelAll,
  futuresGetSymbolFilters,
};
