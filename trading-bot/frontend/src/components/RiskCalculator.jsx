import React, { useState } from 'react';
import { api } from '../api.js';

export default function RiskCalculator() {
  const [entry, setEntry] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function calculate(e) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.riskCalculator(Number(entry), Number(stopLoss));
      setResult(r);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">Risk Calculator</div>
      <form onSubmit={calculate} className="risk-form">
        <label>Entry price<input value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="e.g. 65000" required /></label>
        <label>Stop-loss price<input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="e.g. 64500" required /></label>
        <button className="btn btn-primary" type="submit">Calculate</button>
      </form>
      {error && <div className="error-text">{error}</div>}
      {result && (
        <div className="risk-result">
          <div>Risking <strong>${result.riskAmountUsdt}</strong> ({result.riskPercent}% of account)</div>
          <div>Position size: <strong>{result.quantity}</strong> units (${result.notionalUsdt} notional)</div>
          {result.estimatedLocally && <div className="settings-hint">Estimated locally against sample data (no live backend).</div>}
        </div>
      )}
    </div>
  );
}
