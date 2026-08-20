import React, { useState } from 'react';
import { api } from '../api.js';

export default function ApprovalQueue({ pending, onResolved }) {
  const [error, setError] = useState(null);
  if (!pending.length) return null;

  async function approve(id) {
    setError(null);
    try {
      await api.approveSignal(id);
      onResolved();
    } catch (err) {
      setError(err.message);
    }
  }
  async function reject(id) {
    setError(null);
    try {
      await api.rejectSignal(id);
      onResolved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="panel panel-alert">
      <div className="panel-title">⏳ Awaiting Your Approval ({pending.length})</div>
      {error && <div className="error-text">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Symbol</th><th>Dir</th><th>Score</th><th>Entry</th><th>Stop</th><th>Target</th><th>R:R</th><th>Why</th><th></th></tr>
          </thead>
          <tbody>
            {pending.map((s) => (
              <tr key={s.id}>
                <td>{s.symbol}</td>
                <td><span className={`pill ${s.direction === 'LONG' ? 'pill-green' : 'pill-red'}`}>{s.direction}</span></td>
                <td>{s.score}</td>
                <td>{s.entry_price}</td>
                <td>{s.stop_loss}</td>
                <td>{s.take_profit}</td>
                <td>{s.risk_reward}:1</td>
                <td className="reasons">{JSON.parse(s.reasons || '[]').join(', ')}</td>
                <td className="actions">
                  <button className="btn btn-small btn-primary" onClick={() => approve(s.id)}>Execute</button>
                  <button className="btn btn-small btn-secondary" onClick={() => reject(s.id)}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
