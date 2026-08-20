const express = require('express');
const config = require('../config');
const logger = require('../logger');
const riskManager = require('../risk/riskManager');
const signalEngine = require('../signals/signalEngine');

/**
 * Inbound webhook for TradingView Pine Script alerts. TradingView cannot be
 * polled or subscribed to for data -- it can only push a webhook when an
 * alert you define fires. Configure a TradingView alert with:
 *   Webhook URL: http://YOUR_SERVER:PORT/webhook/tradingview
 *   Message (JSON):
 *   {
 *     "secret": "{{TRADINGVIEW_WEBHOOK_SECRET}}",
 *     "symbol": "{{ticker}}",
 *     "direction": "LONG",
 *     "entry": {{close}},
 *     "stopLoss": <your Pine Script stop level>,
 *     "takeProfit": <your Pine Script target level>,
 *     "reason": "Pine Script strategy name / condition"
 *   }
 * This signal is merged into the exact same risk-gating and
 * manual-approval pipeline as scanner-generated signals -- it does not
 * bypass any safety check.
 */
function createTradingViewWebhookRouter() {
  const router = express.Router();

  router.post('/tradingview', express.json(), async (req, res) => {
    const body = req.body || {};

    if (!config.tradingviewWebhookSecret || body.secret !== config.tradingviewWebhookSecret) {
      logger.warn('Rejected TradingView webhook: invalid or missing secret');
      return res.status(401).json({ error: 'invalid secret' });
    }

    const { symbol, direction, entry, stopLoss, takeProfit, reason } = body;
    if (!symbol || !['LONG', 'SHORT'].includes(direction) || !entry || !stopLoss || !takeProfit) {
      return res.status(400).json({ error: 'symbol, direction (LONG|SHORT), entry, stopLoss, takeProfit are required' });
    }

    const riskReward =
      Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss);

    const signal = {
      symbol: String(symbol).toUpperCase(),
      timeframe: body.timeframe || 'webhook',
      direction,
      score: Number(body.score) || 70,
      entry: Number(entry),
      stopLoss: Number(stopLoss),
      takeProfit: Number(takeProfit),
      riskReward: Number(riskReward.toFixed(2)),
      reasons: [reason || 'TradingView Pine Script alert'],
    };

    const rrCheck = riskManager.validateSignalRiskReward(signal);
    if (!rrCheck.valid) {
      logger.info(`TradingView webhook signal rejected: ${rrCheck.reason}`);
      return res.status(200).json({ accepted: false, reason: rrCheck.reason });
    }

    const stored = await signalEngine.processSignal(signal, 'TRADINGVIEW_WEBHOOK');
    res.json({ accepted: true, signal: stored });
  });

  return router;
}

module.exports = { createTradingViewWebhookRouter };
