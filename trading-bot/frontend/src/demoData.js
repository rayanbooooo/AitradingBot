// Sample data shown only when the dashboard can't reach a live backend
// (e.g. this static preview deployment, which has no persistent Node
// process behind it). Structurally identical to what /api/* returns.

export const demoSymbols = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
  'LINKUSDT', 'LTCUSDT', 'TRXUSDT', 'ATOMUSDT', 'UNIUSDT',
];

export const demoAppState = {
  liveTradingEnabled: false,
  manualApprovalRequired: true,
  killSwitchActive: false,
  killSwitchReason: null,
  accountBalance: 10412.37,
  startOfDayBalance: 10250,
  startOfWeekBalance: 10000,
  dailyPnLPercent: 1.58,
  weeklyPnLPercent: 4.12,
  consecutiveLosses: 0,
  cooldownUntil: null,
  openPositionsCount: 2,
  dailyHalted: false,
  weeklyHalted: false,
  mode: 'PAPER/SIGNAL-ONLY',
};

const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();

export const demoSignals = [
  { id: 5, symbol: 'BTCUSDT', timeframe: '5m', direction: 'LONG', score: 82, entry_price: 64230.5, stop_loss: 63850, take_profit: 65180, risk_reward: 2.5, reasons: JSON.stringify(['3/3 higher timeframes in uptrend', 'MACD bullish crossover', 'Price inside bullish order block']), source: 'SCANNER', status: 'EXECUTED', created_at: iso(38) },
  { id: 6, symbol: 'SOLUSDT', timeframe: '5m', direction: 'SHORT', score: 71, entry_price: 148.2, stop_loss: 150.4, take_profit: 143.8, risk_reward: 2.0, reasons: JSON.stringify(['RSI overbought (71.4)', 'Price at/above upper Bollinger Band']), source: 'SCANNER', status: 'EXECUTED', created_at: iso(22) },
  { id: 7, symbol: 'ETHUSDT', timeframe: '5m', direction: 'LONG', score: 68, entry_price: 3180.1, stop_loss: 3155, take_profit: 3243, risk_reward: 2.5, reasons: JSON.stringify(['Bullish liquidity sweep detected', 'Price near support cluster (3x tested)']), source: 'SCANNER', status: 'PENDING', created_at: iso(3) },
  { id: 4, symbol: 'AVAXUSDT', timeframe: '5m', direction: 'SHORT', score: 60, entry_price: 27.4, stop_loss: 27.9, take_profit: 26.1, risk_reward: 2.6, reasons: JSON.stringify(['RSI overbought (68.1)']), source: 'SCANNER', status: 'REJECTED', created_at: iso(65) },
];

export const demoPending = demoSignals.filter((s) => s.status === 'PENDING');

export const demoOpenTrades = [
  { id: 101, symbol: 'BTCUSDT', direction: 'LONG', entry_price: 64230.5, stop_loss: 63850, take_profit: 65180, quantity: 0.052, mode: 'PAPER', status: 'OPEN', opened_at: iso(38) },
  { id: 102, symbol: 'SOLUSDT', direction: 'SHORT', entry_price: 148.2, stop_loss: 150.4, take_profit: 143.8, quantity: 9.1, mode: 'PAPER', status: 'OPEN', opened_at: iso(22) },
];

export const demoHistory = [
  { id: 98, symbol: 'ETHUSDT', direction: 'LONG', entry_price: 3095.2, exit_price: 3168.4, pnl_usdt: 87.6, pnl_percent: 2.36, status: 'CLOSED_TP', closed_at: iso(180) },
  { id: 97, symbol: 'DOGEUSDT', direction: 'SHORT', entry_price: 0.182, exit_price: 0.1795, pnl_usdt: 42.1, pnl_percent: 1.37, status: 'CLOSED_TP', closed_at: iso(310) },
  { id: 96, symbol: 'LINKUSDT', direction: 'LONG', entry_price: 17.85, exit_price: 17.52, pnl_usdt: -38.9, pnl_percent: -1.85, status: 'CLOSED_SL', closed_at: iso(420) },
  { id: 95, symbol: 'ADAUSDT', direction: 'LONG', entry_price: 0.612, exit_price: 0.629, pnl_usdt: 55.3, pnl_percent: 2.78, status: 'CLOSED_TP', closed_at: iso(600) },
  { id: 94, symbol: 'BNBUSDT', direction: 'SHORT', entry_price: 612.4, exit_price: 615.1, pnl_usdt: -21.4, pnl_percent: -0.44, status: 'CLOSED_TIME_DECAY', closed_at: iso(1500) },
];

export const demoMetrics = {
  totalTrades: 24,
  wins: 15,
  losses: 9,
  winRatePercent: 62.5,
  avgWinUsdt: 61.2,
  avgLossUsdt: -34.8,
  winLossRatio: 1.76,
  totalPnlUsdt: 412.37,
  roiPercent: 4.12,
  monthlyPnl: { '2026-07': 210.5, '2026-08': 201.87 },
};
