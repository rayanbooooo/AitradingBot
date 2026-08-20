// Ported verbatim from backend/src/signals/smc.js (pure JS, no dependencies,
// no changes needed beyond import/export syntax). See that file for the
// "heuristic, not institutional order-flow" caveat -- it applies here too.

export function findFairValueGaps(candles, lookback = 40) {
  const slice = candles.slice(-lookback);
  const gaps = [];
  for (let i = 2; i < slice.length; i++) {
    const c1 = slice[i - 2];
    const c3 = slice[i];
    if (c1.high < c3.low) {
      gaps.push({ type: 'BULLISH_FVG', top: c3.low, bottom: c1.high, index: i });
    } else if (c1.low > c3.high) {
      gaps.push({ type: 'BEARISH_FVG', top: c1.low, bottom: c3.high, index: i });
    }
  }
  return gaps.slice(-5);
}

export function findOrderBlocks(candles, lookback = 60) {
  const slice = candles.slice(-lookback);
  const avgRange =
    slice.reduce((sum, c) => sum + (c.high - c.low), 0) / slice.length;
  const blocks = [];

  for (let i = 1; i < slice.length - 1; i++) {
    const prevCandle = slice[i - 1];
    const impulse = slice[i];
    const impulseRange = impulse.high - impulse.low;
    const isBullishImpulse = impulse.close > impulse.open;
    const isBearishImpulse = impulse.close < impulse.open;
    const prevIsBearish = prevCandle.close < prevCandle.open;
    const prevIsBullish = prevCandle.close > prevCandle.open;

    if (impulseRange > avgRange * 1.5) {
      if (isBullishImpulse && prevIsBearish) {
        blocks.push({ type: 'BULLISH_OB', top: prevCandle.high, bottom: prevCandle.low, index: i - 1 });
      } else if (isBearishImpulse && prevIsBullish) {
        blocks.push({ type: 'BEARISH_OB', top: prevCandle.high, bottom: prevCandle.low, index: i - 1 });
      }
    }
  }
  return blocks.slice(-5);
}

export function findLiquiditySweeps(candles, swingLookback = 20) {
  if (candles.length < swingLookback + 2) return [];
  const recent = candles.slice(-swingLookback - 1, -1);
  const swingHigh = Math.max(...recent.map((c) => c.high));
  const swingLow = Math.min(...recent.map((c) => c.low));
  const last = candles[candles.length - 1];

  const sweeps = [];
  if (last.high > swingHigh && last.close < swingHigh) {
    sweeps.push({ type: 'BEARISH_SWEEP', level: swingHigh, wick: last.high });
  }
  if (last.low < swingLow && last.close > swingLow) {
    sweeps.push({ type: 'BULLISH_SWEEP', level: swingLow, wick: last.low });
  }
  return sweeps;
}

export function analyzeSmc(candles) {
  return {
    fairValueGaps: findFairValueGaps(candles),
    orderBlocks: findOrderBlocks(candles),
    liquiditySweeps: findLiquiditySweeps(candles),
  };
}
