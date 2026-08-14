import React, { useState } from 'react';
import { api } from '../api.js';

export default function SettingsPanel({ appState, onChanged }) {
  const [resetting, setResetting] = useState(false);

  async function toggleApproval() {
    await api.setManualApproval(!appState.manualApprovalRequired);
    onChanged();
  }

  async function resetBalance() {
    if (!window.confirm('Reset tracked balance, daily/weekly baselines, and loss-streak cooldown back to the configured starting balance?')) return;
    setResetting(true);
    try {
      await api.resetBalance();
      onChanged();
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">Settings</div>
      <div className="settings-row">
        <div>
          <div className="settings-label">Manual approval</div>
          <div className="settings-hint">
            {appState.manualApprovalRequired
              ? 'Every signal waits in the queue for your click before it executes.'
              : 'Signals that pass risk checks execute automatically, no click required.'}
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={appState.manualApprovalRequired} onChange={toggleApproval} />
          <span className="slider" />
        </label>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Live trading</div>
          <div className="settings-hint">
            Currently <strong>{appState.liveTradingEnabled ? 'ENABLED' : 'DISABLED'}</strong>. This is intentionally
            not a dashboard toggle -- flip <code>LIVE_TRADING_ENABLED</code> in the backend's <code>.env</code> and
            restart the process to change it, per the safety spec.
          </div>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Risk limits (read-only here)</div>
          <div className="settings-hint">
            2% risk/trade · -5% daily / -10% weekly halt ·
            1h cooldown after 3 consecutive losses. Change these in the backend .env.
          </div>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Reset balance</div>
          <div className="settings-hint">
            Resets tracked balance and P&amp;L baselines to the configured starting amount.
            {appState.liveTradingEnabled && ' In LIVE mode, the raw balance figure re-syncs to your real Binance balance again within ~30s -- only the daily/weekly baselines and cooldown reset durably.'}
          </div>
        </div>
        <button className="btn btn-small btn-secondary" onClick={resetBalance} disabled={resetting}>
          {resetting ? 'Resetting...' : 'Reset'}
        </button>
      </div>
    </div>
  );
}
