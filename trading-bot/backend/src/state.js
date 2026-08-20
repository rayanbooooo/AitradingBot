const EventEmitter = require('events');
const config = require('./config');
const logger = require('./logger');

/**
 * Central runtime safety/mode state. This is the single source of truth the
 * risk manager and execution engine consult before ever sending an order.
 *
 * liveTradingEnabled is intentionally NOT settable at runtime -- it is fixed
 * for the lifetime of the process from config (which itself only changes via
 * .env + restart). Every other flag here can change live.
 */
class AppState extends EventEmitter {
  constructor() {
    super();
    this.liveTradingEnabled = config.liveTradingEnabled;
    this.manualApprovalRequired = config.manualApprovalDefault;
    this.killSwitchActive = false;
    this.killSwitchReason = null;

    this.accountBalance = config.account.startingBalanceUsdt;
    this.startOfDayBalance = config.account.startingBalanceUsdt;
    this.startOfWeekBalance = config.account.startingBalanceUsdt;

    this.consecutiveLosses = 0;
    this.cooldownUntil = null; // Date | null

    this.openPositionsCount = 0;

    this.dailyHalted = false;
    this.weeklyHalted = false;
  }

  toPublicJSON() {
    return {
      liveTradingEnabled: this.liveTradingEnabled,
      manualApprovalRequired: this.manualApprovalRequired,
      killSwitchActive: this.killSwitchActive,
      killSwitchReason: this.killSwitchReason,
      accountBalance: this.accountBalance,
      startOfDayBalance: this.startOfDayBalance,
      startOfWeekBalance: this.startOfWeekBalance,
      dailyPnLPercent: pct(this.startOfDayBalance, this.accountBalance),
      weeklyPnLPercent: pct(this.startOfWeekBalance, this.accountBalance),
      consecutiveLosses: this.consecutiveLosses,
      cooldownUntil: this.cooldownUntil,
      openPositionsCount: this.openPositionsCount,
      dailyHalted: this.dailyHalted,
      weeklyHalted: this.weeklyHalted,
      mode: this.liveTradingEnabled ? 'LIVE' : 'PAPER/SIGNAL-ONLY',
    };
  }

  setManualApproval(value) {
    this.manualApprovalRequired = !!value;
    logger.info('Manual approval toggle set to', this.manualApprovalRequired);
    this.emit('change');
  }

  triggerKillSwitch(reason) {
    this.killSwitchActive = true;
    this.killSwitchReason = reason;
    logger.warn('KILL SWITCH ACTIVATED:', reason);
    this.emit('killswitch', reason);
    this.emit('change');
  }

  clearKillSwitch() {
    this.killSwitchActive = false;
    this.killSwitchReason = null;
    logger.info('Kill switch cleared');
    this.emit('change');
  }

  recordTradeResult(isWin) {
    if (isWin) {
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses += 1;
      if (this.consecutiveLosses >= config.risk.consecutiveLossCooldownCount) {
        const until = new Date(
          Date.now() + config.risk.consecutiveLossCooldownMinutes * 60 * 1000
        );
        this.cooldownUntil = until;
        logger.warn(
          `${this.consecutiveLosses} consecutive losses -- cooldown until ${until.toISOString()}`
        );
      }
    }
    this.emit('change');
  }

  isInCooldown() {
    if (!this.cooldownUntil) return false;
    if (new Date() >= new Date(this.cooldownUntil)) {
      this.cooldownUntil = null;
      return false;
    }
    return true;
  }

  /** Called once at boot in LIVE mode to replace the config default with the real fetched balance. */
  initializeLiveBalance(realBalance) {
    this.accountBalance = realBalance;
    this.startOfDayBalance = realBalance;
    this.startOfWeekBalance = realBalance;
    logger.info(`Synced starting balance from Binance: ${realBalance.toFixed(2)} USDT`);
    this.emit('change');
  }

  updateBalance(newBalance) {
    this.accountBalance = newBalance;
    this.dailyHalted =
      pct(this.startOfDayBalance, newBalance) <= -config.risk.dailyLossLimitPercent;
    this.weeklyHalted =
      pct(this.startOfWeekBalance, newBalance) <= -config.risk.weeklyLossLimitPercent;
    if (this.dailyHalted) logger.warn('Daily loss limit hit -- new entries halted for today');
    if (this.weeklyHalted) logger.warn('Weekly loss limit hit -- new entries halted for the week');
    this.emit('change');
  }

  /** Resets balance, P&L baselines, and loss-streak/cooldown back to the configured starting point. */
  resetToStartingBalance() {
    const startingBalance = config.account.startingBalanceUsdt;
    this.accountBalance = startingBalance;
    this.startOfDayBalance = startingBalance;
    this.startOfWeekBalance = startingBalance;
    this.consecutiveLosses = 0;
    this.cooldownUntil = null;
    this.dailyHalted = false;
    this.weeklyHalted = false;
    logger.info(`Balance and tracking reset to configured starting balance: ${startingBalance} USDT`);
    this.emit('change');
  }

  resetDaily() {
    this.startOfDayBalance = this.accountBalance;
    this.dailyHalted = false;
    this.emit('change');
  }

  resetWeekly() {
    this.startOfWeekBalance = this.accountBalance;
    this.weeklyHalted = false;
    this.emit('change');
  }
}

function pct(from, to) {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

module.exports = new AppState();
