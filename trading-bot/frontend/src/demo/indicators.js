// Ported from backend/src/market/indicators.js -- kept behaviorally
// identical so the demo's signals are computed the same way the real bot's
// are, not a simplified lookalike. Only the import syntax differs (ESM here
// vs CommonJS on the backend).
import { RSI, MACD, SMA, EMA, BollingerBands, ATR } from 'technicalindicators';

export function computeIndicators(candles) {
  if (!candles || candles.length < 55) return null;

  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);

  const rsi = RSI.calculate({ period: 14, values: close });
  const macd = MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const sma20 = SMA.calculate({ period: 20, values: close });
  const sma50 = SMA.calculate({ period: 50, values: close });
  const ema20 = EMA.calculate({ period: 20, values: close });
  const bb = BollingerBands.calculate({ period: 20, values: close, stdDev: 2 });
  const atr = ATR.calculate({ period: 14, high, low, close });

  const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);
  const prev = (arr) => (arr && arr.length > 1 ? arr[arr.length - 2] : null);

  return {
    price: close[close.length - 1],
    rsi: last(rsi),
    macd: last(macd),
    macdPrev: prev(macd),
    sma20: last(sma20),
    sma50: last(sma50),
    ema20: last(ema20),
    bb: last(bb),
    atr: last(atr),
  };
}

export function findSupportResistance(candles, lookback = 100, swingSize = 3) {
  const slice = candles.slice(-lookback);
  const highs = [];
  const lows = [];

  for (let i = swingSize; i < slice.length - swingSize; i++) {
    const window = slice.slice(i - swingSize, i + swingSize + 1);
    const c = slice[i];
    if (c.high === Math.max(...window.map((w) => w.high))) highs.push(c.high);
    if (c.low === Math.min(...window.map((w) => w.low))) lows.push(c.low);
  }

  const cluster = (levels, tolerancePct = 0.15) => {
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters = [];
    for (const lvl of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(lvl - last.avg) / last.avg * 100 <= tolerancePct) {
        last.values.push(lvl);
        last.avg = last.values.reduce((a, b) => a + b, 0) / last.values.length;
      } else {
        clusters.push({ avg: lvl, values: [lvl] });
      }
    }
    return clusters
      .sort((a, b) => b.values.length - a.values.length)
      .map((c) => ({ level: c.avg, strength: c.values.length }));
  };

  return {
    resistance: cluster(highs).slice(0, 5),
    support: cluster(lows).slice(0, 5),
  };
}
