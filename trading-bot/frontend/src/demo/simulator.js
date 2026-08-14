// A real, working "demo account" that runs entirely in the browser -- no
// backend required. Real Binance market data (public endpoints, no key
// needed), the actual scoring engine (ported from the backend, not a
// simplified lookalike), and simulated execution/P&L persisted to
// localStorage. This is what api.js falls back to when it can't reach a
// real backend, so every dashboard action genuinely works on a public demo
// link instead of failing with "no live backend to send this to."
//
// Not a substitute for the real backend: no leverage/futures mechanics, no
// trailing stop, single-tab state (localStorage, no cross-tab sync). It's
// built to demonstrate the actual signal logic and trading flow, not to be
// a second production execution engine.
import { fetchKlines, fetchPrice } from './binancePublic.js';
import { scoreSymbol } from './scorer.js';

const STORAGE_KEY = 'demo_trading_state_v1';
const STARTING_BALANCE = 10000;
const RISK_PER_TRADE_PERCENT = 2;
const DAILY_LOSS_LIMIT_PERCENT = 5;
const WEEKLY_LOSS_LIMIT_PERCENT = 10;
const CONSECUTIVE_LOSS_COOLDOWN_COUNT = 3;
const CONSECUTIVE_LOSS_COOLDOWN_MINUTES = 60;
const POSITION_TIME_DECAY_HOURS = 24;

// Kept deliberately small -- each visitor's browser makes its own calls to
// Binance's public API independently, so this doesn't aggregate across
// visitors, but there's no reason to be a noisy anonymous API consumer.
export const DEMO_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT',
];
const TIMEFRAMES = ['5m', '1h', '4h', '1d'];
const SCAN_INTERVAL_MS = 3 * 60 * 1000;
const MONITOR_INTERVAL_MS = 20000;

function defaultState() {
  return {
    manualApprovalRequired: true,
    killSwitchActive: false,
    killSwitchReason: null,
    accountBalance: STARTING_BALANCE,
    startOfDayBalance: STARTING_BALANCE,
    startOfWeekBalance: STARTING_BALANCE,
    consecutiveLosses: 0,
    cooldownUntil: null,
    dailyHalted: false,
    weeklyHalted: false,
    signals: [],
    trades: [],
    nextSignalId: 1,
    nextTradeId: 1,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

const state = load();
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full/unavailable -- demo still works this session */ }
}

// --- pub/sub, mirrors the real backend's WebSocket message shape so
// useWebSocket.js can treat both sources identically ---
const listeners = new Set();
function emit(type, payload) {
  for (const cb of listeners) cb({ type, payload, ts: new Date().toISOString() });
}
export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function pct(from, to) {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

function publicState() {
  return {
    liveTradingEnabled: false,
    manualApprovalRequired: state.manualApprovalRequired,
    killSwitchActive: state.killSwitchActive,
    killSwitchReason: state.killSwitchReason,
    accountBalance: state.accountBalance,
    startOfDayBalance: state.startOfDayBalance,
    startOfWeekBalance: state.startOfWeekBalance,
    dailyPnLPercent: pct(state.startOfDayBalance, state.accountBalance),
    weeklyPnLPercent: pct(state.startOfWeekBalance, state.accountBalance),
    consecutiveLosses: state.consecutiveLosses,
    cooldownUntil: state.cooldownUntil,
    openPositionsCount: state.trades.filter((t) => t.status === 'OPEN').length,
    dailyHalted: state.dailyHalted,
    weeklyHalted: state.weeklyHalted,
    mode: 'DEMO',
  };
}

function isInCooldown() {
  if (!state.cooldownUntil) return false;
  if (new Date() >= new Date(state.cooldownUntil)) {
    state.cooldownUntil = null;
    return false;
  }
  return true;
}

function evaluateGate() {
  if (state.killSwitchActive) return { allowed: false, reason: `Emergency stop active: ${state.killSwitchReason}` };
  if (state.dailyHalted) return { allowed: false, reason: `Daily loss limit (-${DAILY_LOSS_LIMIT_PERCENT}%) hit -- trading halted for today` };
  if (state.weeklyHalted) return { allowed: false, reason: `Weekly loss limit (-${WEEKLY_LOSS_LIMIT_PERCENT}%) hit -- trading paused for the week` };
  if (isInCooldown()) return { allowed: false, reason: `Cooldown active after ${CONSECUTIVE_LOSS_COOLDOWN_COUNT} consecutive losses until ${state.cooldownUntil}` };
  return { allowed: true, reason: null };
}

function computePositionSize(balance, entry, stopLoss) {
  const riskAmountUsdt = balance * (RISK_PER_TRADE_PERCENT / 100);
  const stopDistance = Math.abs(entry - stopLoss);
  if (stopDistance <= 0) return { quantity: 0, riskAmountUsdt: 0 };
  return { quantity: riskAmountUsdt / stopDistance, riskAmountUsdt };
}

function updateBalance(newBalance) {
  state.accountBalance = newBalance;
  state.dailyHalted = pct(state.startOfDayBalance, newBalance) <= -DAILY_LOSS_LIMIT_PERCENT;
  state.weeklyHalted = pct(state.startOfWeekBalance, newBalance) <= -WEEKLY_LOSS_LIMIT_PERCENT;
  persist();
  emit('state', publicState());
}

function recordTradeResult(isWin) {
  if (isWin) {
    state.consecutiveLosses = 0;
  } else {
    state.consecutiveLosses += 1;
    if (state.consecutiveLosses >= CONSECUTIVE_LOSS_COOLDOWN_COUNT) {
      state.cooldownUntil = new Date(Date.now() + CONSECUTIVE_LOSS_COOLDOWN_MINUTES * 60000).toISOString();
    }
  }
  persist();
}

async function executeSignal(signalRow) {
  const { symbol, direction, entry_price: entrySignalPrice, stop_loss: stopLoss, take_profit: takeProfit } = signalRow;
  try {
    const { quantity: rawQty } = computePositionSize(state.accountBalance, entrySignalPrice, stopLoss);
    if (rawQty <= 0) throw new Error('Computed position size is zero/invalid');

    const simulatedSlippagePct = (Math.random() - 0.3) * 0.05;
    const executionPrice = entrySignalPrice * (1 + simulatedSlippagePct / 100);

    const trade = {
      id: state.nextTradeId++,
      signal_id: signalRow.id,
      opened_at: new Date().toISOString(),
      closed_at: null,
      symbol, direction,
      signal_price: entrySignalPrice,
      entry_price: executionPrice,
      slippage: executionPrice - entrySignalPrice,
      quantity: rawQty,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      exit_price: null,
      pnl_usdt: null,
      pnl_percent: null,
      status: 'OPEN',
      mode: 'DEMO',
    };
    state.trades.unshift(trade);
    signalRow.status = 'EXECUTED';
    persist();
    emit('tradeOpened', trade);
    return trade;
  } catch (e) {
    emit('executionFailed', { signal: signalRow, error: e.message });
    return null;
  }
}

async function closeTradeInternal(trade, currentPrice, status, reason) {
  const direction = trade.direction === 'LONG' ? 1 : -1;
  const pnlUsdt = (currentPrice - trade.entry_price) * trade.quantity * direction;
  const pnlPercent = ((currentPrice - trade.entry_price) / trade.entry_price) * 100 * direction;

  trade.closed_at = new Date().toISOString();
  trade.exit_price = currentPrice;
  trade.pnl_usdt = pnlUsdt;
  trade.pnl_percent = pnlPercent;
  trade.status = status;
  persist();

  updateBalance(state.accountBalance + pnlUsdt);
  recordTradeResult(pnlUsdt > 0);
  emit('tradeClosed', { ...trade, reason });
  return trade;
}

async function processSignal(signal, source) {
  const record = {
    id: state.nextSignalId++,
    created_at: new Date().toISOString(),
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    direction: signal.direction,
    score: signal.score,
    entry_price: signal.entry,
    stop_loss: signal.stopLoss,
    take_profit: signal.takeProfit,
    risk_reward: signal.riskReward,
    reasons: JSON.stringify(signal.reasons),
    source,
    status: 'PENDING',
  };
  state.signals.unshift(record);
  state.signals = state.signals.slice(0, 100);
  persist();
  emit('newSignal', record);

  const gate = evaluateGate();
  if (!gate.allowed) {
    record.status = 'REJECTED';
    persist();
    emit('signalRejected', { ...record, reason: gate.reason });
    return record;
  }

  if (state.manualApprovalRequired) {
    emit('awaitingApproval', record);
    return record;
  }

  record.status = 'APPROVED';
  persist();
  await executeSignal(record);
  return record;
}

async function monitorTick() {
  for (const trade of state.trades.filter((t) => t.status === 'OPEN')) {
    let price;
    try {
      price = await fetchPrice(trade.symbol);
    } catch {
      continue;
    }

    const direction = trade.direction === 'LONG' ? 1 : -1;
    const hasStop = trade.stop_loss != null;
    const hasTarget = trade.take_profit != null;

    const ageHours = (Date.now() - new Date(trade.opened_at).getTime()) / 3600000;
    if (ageHours >= POSITION_TIME_DECAY_HOURS) {
      await closeTradeInternal(trade, price, 'CLOSED_TIME_DECAY', `Open ${ageHours.toFixed(1)}h, past time-decay limit`);
      continue;
    }

    const hitStop = hasStop && (direction === 1 ? price <= trade.stop_loss : price >= trade.stop_loss);
    const hitTarget = hasTarget && (direction === 1 ? price >= trade.take_profit : price <= trade.take_profit);
    if (hitStop) { await closeTradeInternal(trade, price, 'CLOSED_SL', 'Stop-loss hit'); continue; }
    if (hitTarget) { await closeTradeInternal(trade, price, 'CLOSED_TP', 'Take-profit hit'); }
    // No trailing-stop simulation here -- kept simple; the real backend has it.
  }
}

async function scanTick() {
  const busy = new Set([
    ...state.trades.filter((t) => t.status === 'OPEN').map((t) => t.symbol),
    ...state.signals.filter((s) => s.status === 'PENDING').map((s) => s.symbol),
  ]);
  for (const symbol of DEMO_SYMBOLS) {
    if (busy.has(symbol)) continue;
    try {
      const candlesByTf = {};
      for (const tf of TIMEFRAMES) {
        candlesByTf[tf] = await fetchKlines(symbol, tf, 200);
      }
      const signal = scoreSymbol(symbol, candlesByTf);
      if (signal) await processSignal(signal, 'SCANNER');
    } catch (e) {
      console.warn(`Demo scan failed for ${symbol}:`, e.message); // eslint-disable-line no-console
    }
  }
}

let started = false;
export function start() {
  if (started) return;
  started = true;
  emit('state', publicState());
  scanTick();
  setInterval(scanTick, SCAN_INTERVAL_MS);
  setInterval(monitorTick, MONITOR_INTERVAL_MS);
}

export const demoApi = {
  getState: async () => publicState(),
  getSymbols: async () => DEMO_SYMBOLS,
  getPrice: async (symbol) => ({ symbol, price: await fetchPrice(symbol) }),
  getSignals: async (limit = 50) => state.signals.slice(0, limit),
  getPendingSignals: async () => state.signals.filter((s) => s.status === 'PENDING'),

  approveSignal: async (id) => {
    const signal = state.signals.find((s) => s.id === Number(id));
    if (!signal || signal.status !== 'PENDING') throw new Error('Signal not pending');
    const gate = evaluateGate();
    if (!gate.allowed) {
      signal.status = 'REJECTED';
      persist();
      throw new Error(gate.reason);
    }
    signal.status = 'APPROVED';
    persist();
    await executeSignal(signal);
    return { ok: true, signal };
  },

  rejectSignal: async (id) => {
    const signal = state.signals.find((s) => s.id === Number(id));
    if (signal) { signal.status = 'REJECTED'; persist(); }
    return { ok: true, signal };
  },

  getOpenTrades: async () => state.trades.filter((t) => t.status === 'OPEN'),
  getTradeHistory: async (limit = 20) => state.trades.filter((t) => t.status !== 'OPEN').slice(0, limit),

  closeTrade: async (id) => {
    const trade = state.trades.find((t) => t.id === Number(id) && t.status === 'OPEN');
    if (!trade) throw new Error('Open trade not found');
    const price = await fetchPrice(trade.symbol);
    const closed = await closeTradeInternal(trade, price, 'CLOSED_MANUAL', 'Manual close from dashboard');
    return { ok: true, trade: closed };
  },

  placeManualTrade: async (order) => {
    const { symbol, direction, stopLoss, takeProfit, quantity } = order;
    if (!symbol || !['LONG', 'SHORT'].includes(direction)) throw new Error('symbol and direction are required');
    if (!stopLoss && !quantity) throw new Error('Provide a stop-loss (for auto risk-sizing) or a manual quantity');
    const gate = evaluateGate();
    if (!gate.allowed) throw new Error(gate.reason);

    const sym = symbol.toUpperCase();
    const entry = await fetchPrice(sym);
    const stop = stopLoss ? Number(stopLoss) : null;
    const target = takeProfit ? Number(takeProfit) : null;
    const riskReward = stop != null && target != null
      ? Number((Math.abs(target - entry) / Math.abs(entry - stop)).toFixed(2))
      : null;

    const record = {
      id: state.nextSignalId++,
      created_at: new Date().toISOString(),
      symbol: sym, timeframe: 'manual', direction, score: 100,
      entry_price: entry, stop_loss: stop, take_profit: target, risk_reward: riskReward,
      reasons: JSON.stringify(['Manually placed from dashboard']), source: 'MANUAL', status: 'PENDING',
    };
    state.signals.unshift(record);
    persist();

    let rawQty;
    if (quantity) {
      rawQty = Number(quantity);
    } else {
      if (stop == null) throw new Error('Cannot auto-size a position without a stop-loss -- provide a stop-loss or a manual quantity');
      rawQty = computePositionSize(state.accountBalance, entry, stop).quantity;
    }
    if (rawQty <= 0) throw new Error('Computed position size is zero/invalid');

    const trade = {
      id: state.nextTradeId++, signal_id: record.id, opened_at: new Date().toISOString(), closed_at: null,
      symbol: sym, direction, signal_price: entry, entry_price: entry, slippage: 0, quantity: rawQty,
      stop_loss: stop, take_profit: target, exit_price: null, pnl_usdt: null, pnl_percent: null,
      status: 'OPEN', mode: 'DEMO',
    };
    state.trades.unshift(trade);
    record.status = 'EXECUTED';
    persist();
    emit('tradeOpened', trade);
    return { ok: true, trade };
  },

  emergencyStop: async (reason) => {
    state.killSwitchActive = true;
    state.killSwitchReason = reason || 'Manual emergency stop from dashboard';
    for (const trade of state.trades.filter((t) => t.status === 'OPEN')) {
      let price = trade.entry_price;
      try { price = await fetchPrice(trade.symbol); } catch { /* fall back to entry price */ }
      await closeTradeInternal(trade, price, 'CLOSED_EMERGENCY', state.killSwitchReason);
    }
    persist();
    emit('state', publicState());
    return { ok: true, state: publicState() };
  },

  clearEmergencyStop: async () => {
    state.killSwitchActive = false;
    state.killSwitchReason = null;
    persist();
    emit('state', publicState());
    return { ok: true, state: publicState() };
  },

  setManualApproval: async (enabled) => {
    state.manualApprovalRequired = !!enabled;
    persist();
    emit('state', publicState());
    return { ok: true, state: publicState() };
  },

  resetBalance: async () => {
    state.accountBalance = STARTING_BALANCE;
    state.startOfDayBalance = STARTING_BALANCE;
    state.startOfWeekBalance = STARTING_BALANCE;
    state.consecutiveLosses = 0;
    state.cooldownUntil = null;
    state.dailyHalted = false;
    state.weeklyHalted = false;
    persist();
    emit('state', publicState());
    return { ok: true, state: publicState() };
  },

  getMetrics: async () => {
    const closed = state.trades.filter((t) => t.status !== 'OPEN');
    const wins = closed.filter((t) => t.pnl_usdt > 0);
    const losses = closed.filter((t) => t.pnl_usdt <= 0);
    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl_usdt, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl_usdt, 0) / losses.length : 0;
    const totalPnl = closed.reduce((s, t) => s + (t.pnl_usdt || 0), 0);
    const byMonth = {};
    for (const t of closed) {
      const month = (t.closed_at || '').slice(0, 7);
      byMonth[month] = (byMonth[month] || 0) + (t.pnl_usdt || 0);
    }
    return {
      totalTrades: closed.length, wins: wins.length, losses: losses.length,
      winRatePercent: Number(winRate.toFixed(2)),
      avgWinUsdt: Number(avgWin.toFixed(2)), avgLossUsdt: Number(avgLoss.toFixed(2)),
      winLossRatio: avgLoss !== 0 ? Number(Math.abs(avgWin / avgLoss).toFixed(2)) : null,
      totalPnlUsdt: Number(totalPnl.toFixed(2)),
      roiPercent: Number(((totalPnl / STARTING_BALANCE) * 100).toFixed(2)),
      monthlyPnl: byMonth,
    };
  },

  riskCalculator: async (entry, stopLoss) => {
    const { quantity, riskAmountUsdt } = computePositionSize(state.accountBalance, Number(entry), Number(stopLoss));
    return {
      accountBalance: state.accountBalance, riskPercent: RISK_PER_TRADE_PERCENT,
      riskAmountUsdt: Number(riskAmountUsdt.toFixed(2)), quantity: Number(quantity.toFixed(6)),
      notionalUsdt: Number((quantity * Number(entry)).toFixed(2)),
    };
  },
};

export function tradesToCsv() {
  const COLUMNS = ['id', 'symbol', 'direction', 'mode', 'opened_at', 'closed_at', 'signal_price', 'entry_price', 'slippage', 'quantity', 'stop_loss', 'take_profit', 'exit_price', 'pnl_usdt', 'pnl_percent', 'status'];
  const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const closed = state.trades.filter((t) => t.status !== 'OPEN');
  return [COLUMNS.join(','), ...closed.map((t) => COLUMNS.map((c) => esc(t[c])).join(','))].join('\n');
}
