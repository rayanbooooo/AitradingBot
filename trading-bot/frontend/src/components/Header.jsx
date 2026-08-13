import React from 'react';

export default function Header({ appState, connected, onEmergencyStop, onClearStop }) {
  const mode = appState?.liveTradingEnabled ? 'LIVE' : 'PAPER / SIGNAL-ONLY';
  const modeClass = appState?.liveTradingEnabled ? 'mode-live' : 'mode-paper';

  return (
    <header className="header">
      <div className="header-left">
        <h1>AI Trading Bot</h1>
        <span className={`badge ${modeClass}`}>{mode}</span>
        <span className={`badge ${connected ? 'badge-ok' : 'badge-bad'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        {appState?.killSwitchActive && (
          <span className="badge badge-bad">KILL SWITCH: {appState.killSwitchReason}</span>
        )}
      </div>
      <div className="header-right">
        <div className="stat">
          <span className="stat-label">Balance</span>
          <span className="stat-value">${appState?.accountBalance?.toFixed(2) ?? '--'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Daily P&amp;L</span>
          <span className={`stat-value ${appState?.dailyPnLPercent < 0 ? 'negative' : 'positive'}`}>
            {appState?.dailyPnLPercent?.toFixed(2) ?? '0.00'}%
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Open Positions</span>
          <span className="stat-value">{appState?.openPositionsCount ?? 0}/3</span>
        </div>
        {appState?.killSwitchActive ? (
          <button className="btn btn-secondary" onClick={onClearStop}>Clear Kill Switch</button>
        ) : (
          <button className="btn btn-danger" onClick={onEmergencyStop}>🛑 EMERGENCY STOP</button>
        )}
      </div>
    </header>
  );
}
