import React, { useMemo } from 'react';

/**
 * Performance-by-market heat map, computed client-side from trade history.
 * (Execution currently trades a single primary timeframe -- 5m -- so a
 * timeframe breakdown isn't meaningful yet; this groups by symbol instead,
 * which is the axis that actually has data today.)
 */
export default function HeatMap({ trades }) {
  const bySymbol = useMemo(() => {
    const map = {};
    for (const t of trades) {
      if (t.pnl_usdt == null) continue;
      if (!map[t.symbol]) map[t.symbol] = { symbol: t.symbol, pnl: 0, count: 0 };
      map[t.symbol].pnl += t.pnl_usdt;
      map[t.symbol].count += 1;
    }
    return Object.values(map).sort((a, b) => b.pnl - a.pnl);
  }, [trades]);

  const maxAbs = Math.max(1, ...bySymbol.map((s) => Math.abs(s.pnl)));

  return (
    <div className="panel">
      <div className="panel-title">Performance by Market</div>
      {bySymbol.length === 0 ? (
        <div className="empty">No closed trades yet.</div>
      ) : (
        <div className="heatmap-grid">
          {bySymbol.map((s) => {
            const intensity = Math.abs(s.pnl) / maxAbs;
            const bg = s.pnl >= 0
              ? `rgba(34, 197, 94, ${0.15 + intensity * 0.6})`
              : `rgba(239, 68, 68, ${0.15 + intensity * 0.6})`;
            return (
              <div key={s.symbol} className="heatmap-cell" style={{ background: bg }}>
                <div className="heatmap-symbol">{s.symbol}</div>
                <div className="heatmap-pnl">{s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(2)}</div>
                <div className="heatmap-count">{s.count} trades</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
