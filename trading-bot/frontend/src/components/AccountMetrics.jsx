import React from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

export default function AccountMetrics({ metrics }) {
  if (!metrics) return null;
  const monthly = Object.entries(metrics.monthlyPnl || {}).map(([month, pnl]) => ({ month, pnl: Number(pnl.toFixed(2)) }));

  return (
    <div className="panel">
      <div className="panel-title">Account Performance</div>
      <div className="metrics-grid">
        <Metric label="Total Trades" value={metrics.totalTrades} />
        <Metric label="Win Rate" value={`${metrics.winRatePercent}%`} />
        <Metric label="Avg Win" value={`$${metrics.avgWinUsdt}`} good />
        <Metric label="Avg Loss" value={`$${metrics.avgLossUsdt}`} bad />
        <Metric label="Win/Loss Ratio" value={metrics.winLossRatio ?? '--'} />
        <Metric label="Total P&L" value={`$${metrics.totalPnlUsdt}`} good={metrics.totalPnlUsdt >= 0} bad={metrics.totalPnlUsdt < 0} />
        <Metric label="ROI" value={`${metrics.roiPercent}%`} good={metrics.roiPercent >= 0} bad={metrics.roiPercent < 0} />
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

function Metric({ label, value, good, bad }) {
  return (
    <div className="metric-tile">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${good ? 'positive' : ''} ${bad ? 'negative' : ''}`}>{value}</div>
    </div>
  );
}
