const express = require('express');
const { statements } = require('../db/db');
const state = require('../state');
const config = require('../config');
const signalEngine = require('../signals/signalEngine');
const executionEngine = require('../execution/executionEngine');
const exchange = require('../exchange/binanceClient');
const riskManager = require('../risk/riskManager');
const { tradesToCsv } = require('../csv/exportCsv');
const logger = require('../logger');

function computeMetrics() {
  const closed = statements.allClosedTrades.all();
  const wins = closed.filter((t) => t.pnl_usdt > 0);
  const losses = closed.filter((t) => t.pnl_usdt <= 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl_usdt, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl_usdt, 0) / losses.length : 0;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl_usdt || 0), 0);
  const roiPercent = (totalPnl / config.account.startingBalanceUsdt) * 100;

  const byMonth = {};
  for (const t of closed) {
    const month = (t.closed_at || '').slice(0, 7);
    byMonth[month] = (byMonth[month] || 0) + (t.pnl_usdt || 0);
  }

  return {
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRatePercent: Number(winRate.toFixed(2)),
    avgWinUsdt: Number(avgWin.toFixed(2)),
    avgLossUsdt: Number(avgLoss.toFixed(2)),
    winLossRatio: avgLoss !== 0 ? Number(Math.abs(avgWin / avgLoss).toFixed(2)) : null,
    totalPnlUsdt: Number(totalPnl.toFixed(2)),
    roiPercent: Number(roiPercent.toFixed(2)),
    monthlyPnl: byMonth,
  };
}

function createApiRouter() {
  const router = express.Router();
  router.use(express.json());

  router.get('/state', (req, res) => res.json(state.toPublicJSON()));

  router.get('/candles/:symbol', async (req, res) => {
    try {
      const interval = req.query.timeframe || '5m';
      const candles = await exchange.getKlines(req.params.symbol.toUpperCase(), interval, 200);
      res.json(candles);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/symbols', (req, res) => res.json(require('../market/symbols').SYMBOLS));

  router.get('/price/:symbol', async (req, res) => {
    try {
      res.json({ symbol: req.params.symbol, price: await exchange.getPrice(req.params.symbol.toUpperCase()) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/signals', (req, res) => {
    const limit = Number(req.query.limit) || 50;
    res.json(statements.recentSignals.all(limit));
  });

  router.get('/signals/pending', (req, res) => {
    res.json(statements.pendingSignals.all());
  });

  router.post('/signals/:id/approve', async (req, res) => {
    try {
      const signal = await signalEngine.approveSignal(req.params.id);
      res.json({ ok: true, signal });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post('/signals/:id/reject', (req, res) => {
    const signal = signalEngine.rejectSignal(req.params.id);
    res.json({ ok: true, signal });
  });

  router.get('/trades/open', (req, res) => res.json(statements.openTrades.all()));

  router.get('/trades/history', (req, res) => {
    const limit = Number(req.query.limit) || 20;
    res.json(statements.recentTrades.all(limit));
  });

  router.post('/trades/:id/close', async (req, res) => {
    const trade = statements.openTrades.all().find((t) => String(t.id) === req.params.id);
    if (!trade) return res.status(404).json({ ok: false, error: 'Open trade not found' });
    try {
      const price = await exchange.getPrice(trade.symbol);
      const closed = await executionEngine.closeTrade(trade, price, 'CLOSED_MANUAL', 'Manual override from dashboard');
      res.json({ ok: true, trade: closed });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Manual trade ticket: user-initiated (not scanner/webhook-generated),
  // fires immediately with no confirmation step. Still runs through the
  // same risk gate as automated signals -- daily/weekly halts, cooldown,
  // and kill switch all still apply. Skipped, at the user's explicit
  // request: the RR/score signal-quality filters (specific to the bot's own
  // confidence scoring, not a human's deliberate entry), the concurrent-
  // position cap, and the requirement for a stop-loss/take-profit.
  // Without a stop-loss, auto risk-sizing has nothing to size against, so
  // a manual quantity is required in that case (enforced below); without
  // either stop-loss or take-profit, the 24h time-decay close is the only
  // guaranteed exit until the position is closed by hand.
  router.post('/trades/manual', async (req, res) => {
    const { symbol, direction, stopLoss, takeProfit, leverage, quantity } = req.body || {};
    if (!symbol || !['LONG', 'SHORT'].includes(direction)) {
      return res.status(400).json({ ok: false, error: 'symbol and direction (LONG|SHORT) are required' });
    }
    if (!stopLoss && !quantity) {
      return res.status(400).json({ ok: false, error: 'Provide a stop-loss (for auto risk-sizing) or a manual quantity' });
    }
    const gate = riskManager.evaluateGate(state);
    if (!gate.allowed) {
      return res.status(400).json({ ok: false, error: gate.reason });
    }

    try {
      const sym = symbol.toUpperCase();
      const entry = await exchange.getPrice(sym);
      const stop = stopLoss ? Number(stopLoss) : null;
      const target = takeProfit ? Number(takeProfit) : null;
      const riskReward = stop != null && target != null
        ? Number((Math.abs(target - entry) / Math.abs(entry - stop)).toFixed(2))
        : null;

      const record = {
        created_at: new Date().toISOString(),
        symbol: sym,
        timeframe: 'manual',
        direction,
        score: 100,
        entry_price: entry,
        stop_loss: stop,
        take_profit: target,
        risk_reward: riskReward,
        reasons: JSON.stringify(['Manually placed from dashboard']),
        source: 'MANUAL',
        status: 'APPROVED',
      };
      const info = statements.insertSignal.run(record);
      const signalRow = statements.getSignal.get(info.lastInsertRowid);

      const trade = await executionEngine.executeSignal(signalRow, {
        leverageOverride: leverage ? Number(leverage) : undefined,
        quantityOverride: quantity ? Number(quantity) : undefined,
      });
      if (!trade) return res.status(500).json({ ok: false, error: 'Execution failed -- check server logs' });
      res.json({ ok: true, trade });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Resets tracked balance and P&L baselines back to STARTING_ACCOUNT_BALANCE_USDT.
  // In LIVE mode this is only durable for the daily/weekly baselines and the
  // loss-streak/cooldown state -- the raw balance figure will be overwritten
  // again by the next balancePoller tick (~30s) with the account's real
  // Binance balance, which is correct: you can't force a live balance to be
  // something it isn't. Mainly useful for resetting PAPER mode between runs.
  router.post('/reset-balance', (req, res) => {
    state.resetToStartingBalance();
    res.json({ ok: true, state: state.toPublicJSON() });
  });

  router.post('/emergency-stop', async (req, res) => {
    const reason = (req.body && req.body.reason) || 'Manual emergency stop from dashboard';
    logger.warn('Emergency stop requested via API:', reason);
    await executionEngine.emergencyCloseAll(reason);
    res.json({ ok: true, state: state.toPublicJSON() });
  });

  router.post('/emergency-stop/clear', (req, res) => {
    state.clearKillSwitch();
    res.json({ ok: true, state: state.toPublicJSON() });
  });

  router.post('/settings/manual-approval', (req, res) => {
    state.setManualApproval(!!req.body.enabled);
    res.json({ ok: true, state: state.toPublicJSON() });
  });

  router.get('/metrics', (req, res) => res.json(computeMetrics()));

  router.get('/export/csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="trade-history.csv"');
    res.send(tradesToCsv());
  });

  // Risk calculator: given a hypothetical entry/stop, show $ at risk and
  // the position size the bot would actually take, without placing a trade.
  router.post('/risk-calculator', (req, res) => {
    const { entry, stopLoss } = req.body || {};
    if (!entry || !stopLoss) return res.status(400).json({ error: 'entry and stopLoss required' });
    const { quantity, riskAmountUsdt } = riskManager.computePositionSize(state.accountBalance, Number(entry), Number(stopLoss));
    res.json({
      accountBalance: state.accountBalance,
      riskPercent: config.risk.riskPerTradePercent,
      riskAmountUsdt: Number(riskAmountUsdt.toFixed(2)),
      quantity: Number(quantity.toFixed(6)),
      notionalUsdt: Number((quantity * Number(entry)).toFixed(2)),
    });
  });

  return router;
}

module.exports = { createApiRouter, computeMetrics };
