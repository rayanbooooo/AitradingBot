const config = require('../config');
const logger = require('../logger');

/**
 * Pre-trade gate. Every one of these checks must pass before a signal is
 * even allowed to reach the execution engine, live or paper. This is the
 * single choke point enforcing the mandatory risk-management spec.
 */
function evaluateGate(state) {
  if (state.killSwitchActive) {
    return { allowed: false, reason: `Emergency stop active: ${state.killSwitchReason}` };
  }
  if (state.dailyHalted) {
    return { allowed: false, reason: `Daily loss limit (-${config.risk.dailyLossLimitPercent}%) hit -- trading halted for today` };
  }
  if (state.weeklyHalted) {
    return { allowed: false, reason: `Weekly loss limit (-${config.risk.weeklyLossLimitPercent}%) hit -- trading paused for the week` };
  }
  if (state.isInCooldown()) {
    return { allowed: false, reason: `Cooldown active after ${config.risk.consecutiveLossCooldownCount} consecutive losses until ${state.cooldownUntil}` };
  }
  if (state.openPositionsCount >= config.risk.maxConcurrentPositions) {
    return { allowed: false, reason: `Max concurrent positions reached (${config.risk.maxConcurrentPositions})` };
  }
  return { allowed: true, reason: null };
}

/**
 * Position sizing formula per spec: (Account x Risk%) / Stop Loss Distance.
 * Returns quantity in base-asset units and the USDT amount actually at risk.
 */
function computePositionSize(accountBalance, entryPrice, stopLoss) {
  const riskAmountUsdt = accountBalance * (config.risk.riskPerTradePercent / 100);
  const stopDistance = Math.abs(entryPrice - stopLoss);
  if (stopDistance <= 0) return { quantity: 0, riskAmountUsdt: 0 };
  const quantity = riskAmountUsdt / stopDistance;
  return { quantity, riskAmountUsdt };
}

function validateSignalRiskReward(signal) {
  if (signal.riskReward < config.risk.minRiskRewardRatio) {
    return { valid: false, reason: `Risk/reward ${signal.riskReward} below minimum ${config.risk.minRiskRewardRatio}` };
  }
  if (signal.score < config.risk.minSignalScore) {
    return { valid: false, reason: `Score ${signal.score} below minimum ${config.risk.minSignalScore}` };
  }
  return { valid: true, reason: null };
}

function logRejection(signal, reason) {
  logger.info(`Signal rejected [${signal.symbol} ${signal.direction}]: ${reason}`);
}

module.exports = { evaluateGate, computePositionSize, validateSignalRiskReward, logRejection };
