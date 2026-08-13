const express = require('express');
const { statements } = require('../db/db');
const state = require('../state');
const config = require('../config');
const signalEngine = require('../signals/signalEngine');
const executionEngine = require('../execution/executionEngine');
const exchange = require('../exchange/binanceClient');
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
    const riskManager = require('../risk/riskManager');
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
