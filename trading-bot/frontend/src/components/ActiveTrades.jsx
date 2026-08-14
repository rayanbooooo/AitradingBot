import React, { useState } from 'react';
import { api } from '../api.js';

export default function ActiveTrades({ trades, livePrices, onClosed }) {
  const [error, setError] = useState(null);

  async function close(id) {
    if (!window.confirm('Close this position now at market price?')) return;
    setError(null);
    try {
      await api.closeTrade(id);
      onClosed();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">Active Trades ({trades.length})</div>
      {error && <div className="error-text">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Symbol</th><th>Dir</th><th>Entry</th><th>Stop</th><th>Target</th><th>Qty</th><th>Mode</th><th>Unrealized P&amp;L</th><th></th></tr>
          </thead>
          <tbody>
            {trades.length === 0 && <tr><td colSpan={9} className="empty">No open positions.</td></tr>}
            {trades.map((t) => {
              const price = livePrices[t.symbol];
              const dir = t.direction === 'LONG' ? 1 : -1;
              const pnl = price ? (price - t.entry_price) * t.quantity * dir : null;
              const pnlPct = price ? ((price - t.entry_price) / t.entry_price) * 100 * dir : null;
              return (
                <tr key={t.id}>
                  <td>{t.symbol}</td>
                  <td><span className={`pill ${t.direction === 'LONG' ? 'pill-green' : 'pill-red'}`}>{t.direction}</span></td>
                  <td>{t.entry_price}</td>
                  <td>{t.stop_loss ?? '--'}</td>
                  <td>{t.take_profit ?? '--'}</td>
                  <td>{t.quantity}</td>
                  <td>{t.mode}</td>
                  <td className={pnl == null ? '' : pnl >= 0 ? 'positive' : 'negative'}>
                    {pnl == null ? '--' : `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)`}
                  </td>
                  <td><button className="btn btn-small btn-secondary" onClick={() => close(t.id)}>Close</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
