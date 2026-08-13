require('dotenv').config();

function bool(v, fallback) {
  if (v === undefined) return fallback;
  return v === 'true';
}
function num(v, fallback) {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',
    useTestnet: bool(process.env.USE_TESTNET, true),
  },

  // Read once at boot. Intentionally never re-read at runtime -- flipping
  // live trading requires editing .env and restarting the process.
  liveTradingEnabled: bool(process.env.LIVE_TRADING_ENABLED, false),

  account: {
    startingBalanceUsdt: num(process.env.STARTING_ACCOUNT_BALANCE_USDT, 10000),
  },

  futures: {
    // Kept low deliberately: execution uses USDS-M Futures (required to
    // support SHORT, which spot cannot do), but leverage is what turns
    // futures risk into something bigger than the intended 2%-per-trade
    // spot-equivalent risk. Do not raise this without understanding that
    // liquidation price moves closer to entry as leverage increases.
    leverage: num(process.env.FUTURES_LEVERAGE, 1),
  },

  risk: {
    riskPerTradePercent: num(process.env.RISK_PER_TRADE_PERCENT, 2),
    maxConcurrentPositions: num(process.env.MAX_CONCURRENT_POSITIONS, 3),
    dailyLossLimitPercent: num(process.env.DAILY_LOSS_LIMIT_PERCENT, 5),
    weeklyLossLimitPercent: num(process.env.WEEKLY_LOSS_LIMIT_PERCENT, 10),
    consecutiveLossCooldownCount: num(process.env.CONSECUTIVE_LOSS_COOLDOWN_COUNT, 3),
    consecutiveLossCooldownMinutes: num(process.env.CONSECUTIVE_LOSS_COOLDOWN_MINUTES, 60),
    minRiskRewardRatio: num(process.env.MIN_RISK_REWARD_RATIO, 2),
    minSignalScore: num(process.env.MIN_SIGNAL_SCORE, 65),
    positionTimeDecayHours: num(process.env.POSITION_TIME_DECAY_HOURS, 24),
  },

  manualApprovalDefault: bool(process.env.MANUAL_APPROVAL_DEFAULT, true),

  server: {
    port: num(process.env.PORT, 4000),
    wsPort: num(process.env.WS_PORT, 4001),
  },

  tradingviewWebhookSecret: process.env.TRADINGVIEW_WEBHOOK_SECRET || '',
};

module.exports = config;
