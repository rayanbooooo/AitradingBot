import React from 'react';

export default function MarketScanner({ signals, selectedSymbol, onSelect }) {
  return (
    <div className="panel">
      <div className="panel-title">Market Scanner &amp; Signals</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th><th>Dir</th><th>Score</th><th>R:R</th><th>Status</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            {signals.length === 0 && (
              <tr><td colSpan={6} className="empty">No signals yet -- the scanner starts 5 minutes after launch.</td></tr>
            )}
            {signals.map((s) => (
              <tr
                key={s.id}
                className={`clickable ${s.symbol === selectedSymbol ? 'row-selected' : ''}`}
                onClick={() => onSelect(s.symbol)}
              >
                <td>{s.symbol}</td>
                <td>
                  <span className={`pill ${s.direction === 'LONG' ? 'pill-green' : 'pill-red'}`}>
                    {s.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}
                  </span>
                </td>
                <td>{s.score}</td>
                <td>{s.risk_reward}:1</td>
                <td>{s.status}</td>
                <td>{new Date(s.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
