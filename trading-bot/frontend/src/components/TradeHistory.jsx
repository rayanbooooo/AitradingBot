import React from 'react';
import { api } from '../api.js';

export default function TradeHistory({ trades, demoMode }) {
  function exportDemoCsv() {
    const blob = new Blob([api.exportCsvNow()], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trade-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel">
      <div className="panel-title">
        Trade History (last {trades.length})
        {demoMode ? (
          <button type="button" className="btn btn-small btn-secondary export-link" onClick={exportDemoCsv}>Export CSV</button>
        ) : (
          <a className="btn btn-small btn-secondary export-link" href={api.exportCsvUrl()} download>Export CSV</a>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>P&amp;L</th><th>Result</th><th>Closed</th></tr>
          </thead>
          <tbody>
            {trades.length === 0 && <tr><td colSpan={7} className="empty">No closed trades yet.</td></tr>}
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{t.symbol}</td>
                <td><span className={`pill ${t.direction === 'LONG' ? 'pill-green' : 'pill-red'}`}>{t.direction}</span></td>
                <td>{t.entry_price}</td>
                <td>{t.exit_price ?? '--'}</td>
                <td className={t.pnl_usdt >= 0 ? 'positive' : 'negative'}>
                  {t.pnl_usdt != null ? `${t.pnl_usdt >= 0 ? '+' : ''}${t.pnl_usdt.toFixed(2)}` : '--'}
                </td>
                <td>{t.status.replace('CLOSED_', '')}</td>
                <td>{t.closed_at ? new Date(t.closed_at).toLocaleString() : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
