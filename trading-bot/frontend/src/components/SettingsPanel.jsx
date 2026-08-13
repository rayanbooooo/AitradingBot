import React from 'react';
import { api } from '../api.js';

export default function SettingsPanel({ appState, onChanged, demoMode }) {
  async function toggleApproval() {
    if (demoMode) return window.alert('Static preview -- no live backend to send this to.');
    await api.setManualApproval(!appState.manualApprovalRequired);
    onChanged();
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
            2% risk/trade · max 3 concurrent positions · -5% daily / -10% weekly halt ·
            1h cooldown after 3 consecutive losses. Change these in the backend .env.
          </div>
        </div>
      </div>
    </div>
  );
}
