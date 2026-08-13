const { computeIndicators, findSupportResistance } = require('../market/indicators');
const { analyzeSmc } = require('./smc');
const config = require('../config');

/**
 * Builds a 0-100 confidence score and a concrete trade plan (direction,
 * entry, stop, target) for one symbol from its multi-timeframe candles.
 * Returns null if there's no tradeable confluence this cycle.
 */
function scoreSymbol(symbol, candlesByTimeframe) {
  const primary = candlesByTimeframe['5m'];
  const higher1h = candlesByTimeframe['1h'];
  const higher4h = candlesByTimeframe['4h'];
  const daily = candlesByTimeframe['1d'];
  if (!primary || primary.length < 55) return null;

  const ind5m = computeIndicators(primary);
  const ind1h = higher1h ? computeIndicators(higher1h) : null;
  const ind4h = higher4h ? computeIndicators(higher4h) : null;
  const indDaily = daily ? computeIndicators(daily) : null;
  if (!ind5m) return null;

  const smc = analyzeSmc(primary);
  const sr = findSupportResistance(primary);
  const price = ind5m.price;

  let longScore = 0;
  let shortScore = 0;
  const reasons = [];

  // --- Higher-timeframe trend alignment (up to 20) ---
  const trendUp = (ind) => ind && ind.sma20 && ind.sma50 && ind.sma20 > ind.sma50;
  const trendDown = (ind) => ind && ind.sma20 && ind.sma50 && ind.sma20 < ind.sma50;
  const higherTfs = [ind1h, ind4h, indDaily].filter(Boolean);
  const upCount = higherTfs.filter(trendUp).length;
  const downCount = higherTfs.filter(trendDown).length;
  if (higherTfs.length) {
    const upScore = Math.round((upCount / higherTfs.length) * 20);
    const downScore = Math.round((downCount / higherTfs.length) * 20);
    longScore += upScore;
    shortScore += downScore;
    if (upScore >= 14) reasons.push(`${upCount}/${higherTfs.length} higher timeframes in uptrend`);
    if (downScore >= 14) reasons.push(`${downCount}/${higherTfs.length} higher timeframes in downtrend`);
  }

  // --- RSI (up to 15) ---
  if (ind5m.rsi != null) {
    if (ind5m.rsi < 35) {
      longScore += 15;
      reasons.push(`RSI oversold (${ind5m.rsi.toFixed(1)})`);
    } else if (ind5m.rsi > 65) {
      shortScore += 15;
      reasons.push(`RSI overbought (${ind5m.rsi.toFixed(1)})`);
    } else if (ind5m.rsi >= 45 && ind5m.rsi <= 60 && trendUp(ind5m)) {
      longScore += 8;
    } else if (ind5m.rsi <= 55 && ind5m.rsi >= 40 && trendDown(ind5m)) {
      shortScore += 8;
    }
  }

  // --- MACD (up to 15) ---
  if (ind5m.macd && ind5m.macdPrev) {
    const bullCross = ind5m.macdPrev.MACD <= ind5m.macdPrev.signal && ind5m.macd.MACD > ind5m.macd.signal;
    const bearCross = ind5m.macdPrev.MACD >= ind5m.macdPrev.signal && ind5m.macd.MACD < ind5m.macd.signal;
    if (bullCross) {
      longScore += 15;
      reasons.push('MACD bullish crossover');
    } else if (bearCross) {
      shortScore += 15;
      reasons.push('MACD bearish crossover');
    } else if (ind5m.macd.histogram > 0) {
      longScore += 6;
    } else if (ind5m.macd.histogram < 0) {
      shortScore += 6;
    }
  }

  // --- Bollinger Bands (up to 10) ---
  if (ind5m.bb) {
    if (price <= ind5m.bb.lower * 1.002) {
      longScore += 10;
      reasons.push('Price at/below lower Bollinger Band');
    } else if (price >= ind5m.bb.upper * 0.998) {
      shortScore += 10;
      reasons.push('Price at/above upper Bollinger Band');
    }
  }

  // --- SMC confluence (up to 25) ---
  const nearOB = (type) =>
    smc.orderBlocks.some((ob) => ob.type === type && price >= ob.bottom * 0.995 && price <= ob.top * 1.005);
  const nearFvg = (type) =>
    smc.fairValueGaps.some((g) => g.type === type && price >= g.bottom * 0.995 && price <= g.top * 1.005);
  const hasSweep = (type) => smc.liquiditySweeps.some((s) => s.type === type);

  if (nearOB('BULLISH_OB')) { longScore += 12; reasons.push('Price inside bullish order block'); }
  if (nearOB('BEARISH_OB')) { shortScore += 12; reasons.push('Price inside bearish order block'); }
  if (nearFvg('BULLISH_FVG')) { longScore += 7; reasons.push('Price inside bullish fair value gap'); }
  if (nearFvg('BEARISH_FVG')) { shortScore += 7; reasons.push('Price inside bearish fair value gap'); }
  if (hasSweep('BULLISH_SWEEP')) { longScore += 10; reasons.push('Bullish liquidity sweep detected'); }
  if (hasSweep('BEARISH_SWEEP')) { shortScore += 10; reasons.push('Bearish liquidity sweep detected'); }

  // --- Support / resistance proximity (up to 15) ---
  const nearestSupport = sr.support.find((s) => Math.abs(price - s.level) / price * 100 <= 0.3);
  const nearestResistance = sr.resistance.find((r) => Math.abs(price - r.level) / price * 100 <= 0.3);
  if (nearestSupport) { longScore += Math.min(15, 5 + nearestSupport.strength * 2); reasons.push(`Price near support cluster (${nearestSupport.strength}x tested)`); }
  if (nearestResistance) { shortScore += Math.min(15, 5 + nearestResistance.strength * 2); reasons.push(`Price near resistance cluster (${nearestResistance.strength}x tested)`); }

  const direction = longScore >= shortScore ? 'LONG' : 'SHORT';
  const score = Math.min(100, Math.round(Math.max(longScore, shortScore)));

  if (score < config.risk.minSignalScore) return null;

  // --- Trade plan: ATR-based stop, RR-based target ---
  const atr = ind5m.atr || price * 0.005;
  const stopDistance = Math.max(atr * 1.5, price * 0.003);
  const rewardMultiple = score >= 85 ? 3 : 2.5;

  const entry = price;
  const stopLoss = direction === 'LONG' ? entry - stopDistance : entry + stopDistance;
  const takeProfit =
    direction === 'LONG'
      ? entry + stopDistance * rewardMultiple
      : entry - stopDistance * rewardMultiple;
  const riskReward = Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss);

  if (riskReward < config.risk.minRiskRewardRatio) return null;

  return {
    symbol,
    timeframe: '5m',
    direction,
    score,
    entry,
    stopLoss,
    takeProfit,
    riskReward: Number(riskReward.toFixed(2)),
    reasons,
  };
}

module.exports = { scoreSymbol };
