const EventEmitter = require('events');
const { fetchMultiTimeframe, subscribePrimaryCloses } = require('../market/klineStream');
const { scoreSymbol } = require('./scorer');
const riskManager = require('../risk/riskManager');
const { statements } = require('../db/db');
const state = require('../state');
const logger = require('../logger');
const { notify } = require('../notifications/notifier');

class SignalEngine extends EventEmitter {
  constructor() {
    super();
    this.symbols = [];
    this.executeSignal = null; // injected by index.js -> executionEngine.executeSignal
    this.scanningStarted = false;
  }

  /**
   * Begins the recurring scan. `executeSignalFn(signalRecord)` is called for
   * any signal that clears risk gating AND does not require manual approval.
   */
  start(symbols, executeSignalFn) {
    this.symbols = symbols;
    this.executeSignal = executeSignalFn;
    this.scanningStarted = true;
    logger.info(`Signal engine starting -- scanning ${symbols.length} symbols`);
    this.unsubscribe = subscribePrimaryCloses(symbols, (symbol) => this.handleCandleClose(symbol));
  }

  async handleCandleClose(symbol) {
    try {
      const alreadyOpen = statements.openTrades.all().some((t) => t.symbol === symbol);
      const alreadyPending = statements.pendingSignals.all().some((s) => s.symbol === symbol);
      if (alreadyOpen || alreadyPending) return;

      const candlesByTf = await fetchMultiTimeframe(symbol);
      const signal = scoreSymbol(symbol, candlesByTf);
      if (!signal) return;

      const rrCheck = riskManager.validateSignalRiskReward(signal);
      if (!rrCheck.valid) {
        riskManager.logRejection(signal, rrCheck.reason);
        return;
      }

      await this.processSignal(signal, 'SCANNER');
    } catch (e) {
      logger.error(`Signal engine error for ${symbol}:`, e.message || e);
    }
  }

  /** Shared entry point for both scanner-generated and TradingView-webhook signals. */
  async processSignal(signal, source) {
    const gate = riskManager.evaluateGate(state);

    const record = {
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
    const info = statements.insertSignal.run(record);
    const signalId = info.lastInsertRowid;
    const stored = statements.getSignal.get(signalId);

    notify(
      `${signal.direction === 'LONG' ? '🟢' : '🔴'} New signal: ${signal.symbol}`,
      `${signal.direction} | score ${signal.score} | R:R ${signal.riskReward}:1`
    );
    this.emit('newSignal', stored);

    if (!gate.allowed) {
      statements.updateSignalStatus.run('REJECTED', signalId);
      riskManager.logRejection(signal, gate.reason);
      this.emit('signalRejected', { ...stored, reason: gate.reason });
      return stored;
    }

    if (state.manualApprovalRequired) {
      // Sits in the approval queue until a human clicks approve/reject via the API.
      this.emit('awaitingApproval', stored);
      return stored;
    }

    // Fully autonomous mode: fire as soon as the signal clears risk gating,
    // no artificial delay -- spec requires execution within ~2s of signal.
    statements.updateSignalStatus.run('APPROVED', signalId);
    await this.executeSignal(statements.getSignal.get(signalId));
    return stored;
  }

  async approveSignal(signalId) {
    const signal = statements.getSignal.get(signalId);
    if (!signal || signal.status !== 'PENDING') throw new Error('Signal not pending');
    const gate = riskManager.evaluateGate(state);
    if (!gate.allowed) {
      statements.updateSignalStatus.run('REJECTED', signalId);
      throw new Error(gate.reason);
    }
    statements.updateSignalStatus.run('APPROVED', signalId);
    await this.executeSignal(statements.getSignal.get(signalId));
    return statements.getSignal.get(signalId);
  }

  rejectSignal(signalId) {
    statements.updateSignalStatus.run('REJECTED', signalId);
    return statements.getSignal.get(signalId);
  }
}

module.exports = new SignalEngine();
