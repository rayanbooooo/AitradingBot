const EventEmitter = require('events');
const exchange = require('../exchange/binanceClient');
const riskManager = require('../risk/riskManager');
const { statements } = require('../db/db');
const state = require('../state');
const config = require('../config');
const logger = require('../logger');
const { notify } = require('../notifications/notifier');

class ExecutionEngine extends EventEmitter {
  /**
   * Executes a stored, already-risk-gated signal record within ~2s of
   * approval. `options.leverageOverride` and `options.quantityOverride` let
   * a manual trade ticket (api/routes.js POST /trades/manual) specify its
   * own leverage and size instead of the bot's 2%-risk auto-sizing --
   * used for manually-initiated trades, never for scanner/webhook signals.
   */
  async executeSignal(signalRow, options = {}) {
    const symbol = signalRow.symbol;
    const direction = signalRow.direction; // LONG | SHORT
    const entrySignalPrice = signalRow.entry_price;
    const stopLoss = signalRow.stop_loss;
    const takeProfit = signalRow.take_profit;
    const mode = state.liveTradingEnabled ? 'LIVE' : 'PAPER';
    const leverage = options.leverageOverride || config.futures.leverage;

    try {
      let rawQty;
      let riskAmountUsdt = null;
      if (options.quantityOverride) {
        rawQty = options.quantityOverride;
      } else {
        const balance = mode === 'LIVE'
          ? await exchange.futuresGetBalanceUsdt().catch(() => state.accountBalance)
          : state.accountBalance;
        const sized = riskManager.computePositionSize(balance, entrySignalPrice, stopLoss);
        rawQty = sized.quantity;
        riskAmountUsdt = sized.riskAmountUsdt;
      }
      if (rawQty <= 0) throw new Error('Computed position size is zero/invalid');

      const filters = await exchange.futuresGetSymbolFilters(symbol);
      const quantity = exchange.roundStep(rawQty, filters.stepSize);
      if (quantity * entrySignalPrice < filters.minNotional) {
        throw new Error(
          `Position notional ${(quantity * entrySignalPrice).toFixed(2)} below exchange minimum ${filters.minNotional}`
        );
      }

      let executionPrice = entrySignalPrice;
      let brokerOrderId = null;

      if (mode === 'LIVE') {
        await exchange.futuresSetLeverage(symbol, leverage);
        const openSide = direction === 'LONG' ? 'BUY' : 'SELL';
        const closeSide = direction === 'LONG' ? 'SELL' : 'BUY';

        const orderResult = await exchange.futuresMarketOrder(symbol, openSide, quantity);
        brokerOrderId = orderResult && (orderResult.orderId || orderResult.clientOrderId);
        executionPrice = (orderResult && parseFloat(orderResult.avgPrice)) || entrySignalPrice;

        // Place protective stop-loss and take-profit as reduceOnly orders so
        // they can only ever flatten this position, never open a new one.
        await exchange.futuresReduceOnlyStopOrder(symbol, closeSide, quantity, stopLoss, 'STOP_MARKET');
        await exchange.futuresReduceOnlyStopOrder(symbol, closeSide, quantity, takeProfit, 'TAKE_PROFIT_MARKET');
      } else {
        // Paper mode: simulate a small amount of realistic slippage so the
        // slippage-tracking column/UI isn't always exactly zero.
        const simulatedSlippagePct = (Math.random() - 0.3) * 0.05; // roughly -0.015% to +0.035%
        executionPrice = entrySignalPrice * (1 + simulatedSlippagePct / 100);
      }

      const slippage = executionPrice - entrySignalPrice;

      const tradeInfo = statements.insertTrade.run({
        signal_id: signalRow.id,
        opened_at: new Date().toISOString(),
        symbol,
        direction,
        signal_price: entrySignalPrice,
        entry_price: executionPrice,
        slippage,
        quantity,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        status: 'OPEN',
        mode,
        broker_order_id: brokerOrderId ? String(brokerOrderId) : null,
      });

      statements.updateSignalStatus.run('EXECUTED', signalRow.id);
      state.openPositionsCount += 1;

      logger.trade(`OPENED ${mode} ${direction} ${symbol} qty=${quantity} entry=${executionPrice} SL=${stopLoss} TP=${takeProfit} leverage=${leverage}x riskUsdt=${riskAmountUsdt != null ? riskAmountUsdt.toFixed(2) : 'n/a (manual size)'}`);
      notify(`✅ Trade opened: ${symbol}`, `${direction} ${quantity} @ ${executionPrice.toFixed(4)} (${mode})`);

      const openedTrade = { id: tradeInfo.lastInsertRowid, ...signalRow, entry_price: executionPrice, quantity, mode, status: 'OPEN' };
      this.emit('tradeOpened', openedTrade);
      return openedTrade;
    } catch (e) {
      logger.error(`Execution failed for ${symbol} ${direction}:`, e.message || e);
      notify(`⚠️ Execution failed: ${symbol}`, e.message || String(e));
      this.emit('executionFailed', { signal: signalRow, error: e.message || String(e) });
      return null;
    }
  }

  /** Closes one open trade, live or paper, and records the realized result. */
  async closeTrade(trade, currentPrice, status, reason) {
    try {
      if (trade.mode === 'LIVE') {
        const closeSide = trade.direction === 'LONG' ? 'SELL' : 'BUY';
        // The broker-side STOP_MARKET/TAKE_PROFIT_MARKET reduceOnly orders
        // placed at entry may have already flattened this position on
        // Binance's side before our polling loop notices. That order
        // rejecting as "already flat" is expected, not fatal -- we still
        // want to record the close locally, so only log it.
        await exchange.futuresMarketOrder(trade.symbol, closeSide, trade.quantity).catch((e) =>
          logger.warn(`Close order for ${trade.symbol} may be redundant (position likely already flat via broker-side SL/TP): ${e.message || e}`)
        );
        await exchange.futuresCancelAll(trade.symbol).catch(() => {});
      }

      const direction = trade.direction === 'LONG' ? 1 : -1;
      const pnlUsdt = (currentPrice - trade.entry_price) * trade.quantity * direction;
      const pnlPercent = ((currentPrice - trade.entry_price) / trade.entry_price) * 100 * direction;

      statements.closeTrade.run({
        id: trade.id,
        closed_at: new Date().toISOString(),
        exit_price: currentPrice,
        pnl_usdt: pnlUsdt,
        pnl_percent: pnlPercent,
        status,
      });

      state.openPositionsCount = Math.max(0, state.openPositionsCount - 1);
      state.updateBalance(state.accountBalance + pnlUsdt);
      state.recordTradeResult(pnlUsdt > 0);

      logger.trade(`CLOSED (${reason}) ${trade.symbol} ${trade.direction} pnl=${pnlUsdt.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`);
      notify(
        `${pnlUsdt >= 0 ? '💰' : '🛑'} Trade closed: ${trade.symbol}`,
        `${reason} | PnL ${pnlUsdt >= 0 ? '+' : ''}${pnlUsdt.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`
      );

      const closed = { ...trade, exit_price: currentPrice, pnl_usdt: pnlUsdt, pnl_percent: pnlPercent, status };
      this.emit('tradeClosed', closed);
      return closed;
    } catch (e) {
      logger.error(`Failed to close trade ${trade.id} (${trade.symbol}):`, e.message || e);
      this.emit('closeFailed', { trade, error: e.message || String(e) });
      return null;
    }
  }

  /** Emergency stop: flattens every open position immediately at market. */
  async emergencyCloseAll(reason) {
    state.triggerKillSwitch(reason);
    const open = statements.openTrades.all();
    logger.warn(`Emergency close-all triggered (${reason}) -- closing ${open.length} open position(s)`);
    for (const trade of open) {
      let price = trade.entry_price;
      try {
        price = await exchange.getPrice(trade.symbol);
      } catch (e) {
        logger.warn(`Could not fetch live price for ${trade.symbol} during emergency close, using entry price`);
      }
      await this.closeTrade(trade, price, 'CLOSED_EMERGENCY', reason);
    }
  }
}

module.exports = new ExecutionEngine();
