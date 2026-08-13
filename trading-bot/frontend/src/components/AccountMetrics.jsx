import React from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

export default function AccountMetrics({ metrics }) {
  if (!metrics) return null;
  const monthly = Object.entries(metrics.monthlyPnl || {}).map(([month, pnl]) => ({ month, pnl: Number(pnl.toFixed(2)) }));

  return (
    <div className="panel">
      <div className="panel-title">Account Performance</div>
      <div className="gauge-row">
        <Gauge label="Win Rate" percent={metrics.winRatePercent} display={`${metrics.winRatePercent}%`} />
        <Gauge
          label="ROI"
          percent={Math.min(100, Math.max(0, 50 + metrics.roiPercent * 2.5))}
          display={`${metrics.roiPercent >= 0 ? '+' : ''}${metrics.roiPercent}%`}
          negative={metrics.roiPercent < 0}
        />
      </div>
      <div className="metrics-grid">
        <Metric label="Total Trades" value={metrics.totalTrades} />
        <Metric label="Win/Loss Ratio" value={metrics.winLossRatio ?? '--'} />
        <Metric label="Avg Win" value={`$${metrics.avgWinUsdt}`} good />
        <Metric label="Avg Loss" value={`$${metrics.avgLossUsdt}`} bad />
        <Metric label="Total P&L" value={`$${metrics.totalPnlUsdt}`} good={metrics.totalPnlUsdt >= 0} bad={metrics.totalPnlUsdt < 0} />
      </div>
      {monthly.length > 0 && (
        <div className="chart-mini">
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={monthly}>
              <XAxis dataKey="month" stroke="#8890a4" fontSize={11} />
              <YAxis stroke="#8890a4" fontSize={11} />
              <Tooltip contentStyle={{ background: '#0f1420', border: '1px solid #1c2333' }} />
              <Line type="monotone" dataKey="pnl" stroke="#60a5fa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Gauge({ label, percent, display, negative }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="gauge">
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle className="gauge__ring-bg" cx="42" cy="42" r={radius} />
        <circle
          className={`gauge__ring ${negative ? 'negative-ring' : ''}`}
          cx="42" cy="42" r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <text x="42" y="47" textAnchor="middle" className="gauge__value">{display}</text>
      </svg>
      <div className="gauge__label">{label}</div>
    </div>
  );
}

function Metric({ label, value, good, bad }) {
  return (
    <div className="metric-tile">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${good ? 'positive' : ''} ${bad ? 'negative' : ''}`}>{value}</div>
    </div>
  );
}
