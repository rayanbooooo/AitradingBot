import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function ManualTradePanel({ symbols, demoMode }) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [direction, setDirection] = useState('LONG');
  const [price, setPrice] = useState(null);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [leverage, setLeverage] = useState('1');
  const [sizeMode, setSizeMode] = useState('auto'); // 'auto' | 'manual'
  const [quantity, setQuantity] = useState('');
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    api.getPrice(symbol).then((r) => !cancelled && setPrice(r.price)).catch(() => setPrice(null));
    return () => { cancelled = true; };
  }, [symbol, demoMode]);

  useEffect(() => {
    if (demoMode || sizeMode !== 'auto' || !price || !stopLoss) return setPreview(null);
    let cancelled = false;
    api.riskCalculator(price, Number(stopLoss)).then((r) => !cancelled && setPreview(r)).catch(() => setPreview(null));
    return () => { cancelled = true; };
  }, [price, stopLoss, sizeMode, demoMode]);

  // Auto-sizing has nothing to size against without a stop distance --
  // a manual quantity is the only way to size a stop-less trade.
  const needsManualQty = sizeMode === 'auto' && !stopLoss;

  async function submit(e) {
    e.preventDefault();
    setResult(null);
    if (demoMode) return setResult({ ok: false, error: 'Static preview -- no live backend to send this to.' });
    if (needsManualQty) {
      return setResult({ ok: false, error: 'No stop-loss set -- switch sizing to manual and enter a quantity, or add a stop-loss.' });
    }
    setSubmitting(true);
    try {
      const order = { symbol, direction, leverage: Number(leverage) || 1 };
      if (stopLoss) order.stopLoss = Number(stopLoss);
      if (takeProfit) order.takeProfit = Number(takeProfit);
      if (sizeMode === 'manual') order.quantity = Number(quantity);
      // Fires immediately -- no confirmation step, per how this panel is meant to be used.
      const r = await api.placeManualTrade(order);
      setResult(r);
    } catch (err) {
      setResult({ ok: false, error: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">Manual Trade</div>
      <form onSubmit={submit} className="risk-form">
        <label>
          Symbol
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {(symbols.length ? symbols : [symbol]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <div className="direction-toggle">
          <button type="button" className={`btn btn-small ${direction === 'LONG' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDirection('LONG')}>LONG</button>
          <button type="button" className={`btn btn-small ${direction === 'SHORT' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setDirection('SHORT')}>SHORT</button>
          <span className="live-price">{price != null ? `Last: ${price}` : '--'}</span>
        </div>

        <label>Stop-loss price (optional)<input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="none" /></label>
        <label>Take-profit price (optional)<input value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="none" /></label>
        <label>Leverage<input value={leverage} onChange={(e) => setLeverage(e.target.value)} placeholder="1" /></label>

        <div className="settings-row" style={{ padding: '4px 0' }}>
          <div className="settings-label" style={{ fontSize: '11px' }}>Sizing</div>
          <label className="switch">
            <input type="checkbox" checked={sizeMode === 'manual'} onChange={(e) => setSizeMode(e.target.checked ? 'manual' : 'auto')} />
            <span className="slider" />
          </label>
          <span className="settings-hint" style={{ margin: 0 }}>{sizeMode === 'manual' ? 'Manual qty' : 'Auto (2% risk)'}</span>
        </div>

        {sizeMode === 'manual' ? (
          <label>Quantity<input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 0.01" /></label>
        ) : preview ? (
          <div className="settings-hint">Estimated size: ~{preview.quantity} units (${preview.riskAmountUsdt} at risk, {preview.riskPercent}%)</div>
        ) : needsManualQty && (
          <div className="settings-hint">No stop-loss set -- switch Sizing to manual and enter a quantity.</div>
        )}

        {!stopLoss && !takeProfit && (
          <div className="settings-hint">No stop-loss or take-profit -- this position's only automatic exit is the 24h time-decay close.</div>
        )}

        <button className="btn btn-danger" type="submit" disabled={submitting}>
          {submitting ? 'Placing...' : `Execute ${direction}`}
        </button>
      </form>
      {result && (
        <div className={result.ok ? 'risk-result positive' : 'error-text'}>
          {result.ok
            ? `Opened: ${result.trade.direction} ${result.trade.quantity} ${result.trade.symbol} @ ${result.trade.entry_price}`
            : `Failed: ${result.error}`}
        </div>
      )}
    </div>
  );
}
