import React, { useEffect, useId, useRef } from 'react';

// TradingView's free embeddable "Advanced Real-Time Chart" widget -- this is
// the actual TradingView UI (pen tool, trendlines, fib retracement, shapes,
// indicators, the whole sidebar), not a lookalike. Loaded from TradingView's
// own CDN, no API key or approval needed (that's only required for their
// separate, heavier "Charting Library" product).
//
// Tradeoff accepted knowingly: this renders TradingView's own market-data
// feed for the symbol, not our backend's candles, so the bot's entry/stop-
// loss/take-profit lines can no longer be drawn directly on it the way the
// old lightweight-charts version did. Use the Active Trades panel for exact
// executed levels; use this chart for analysis and drawing.
const TV_SCRIPT_SRC = 'https://s3.tradingview.com/tv.js';
let tvScriptPromise = null;
function loadTradingViewScript() {
  if (window.TradingView) return Promise.resolve();
  if (!tvScriptPromise) {
    tvScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TV_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return tvScriptPromise;
}

const INTERVAL_MAP = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D' };

export default function PriceChart({ symbol, symbols, onSymbolChange, timeframe, timeframes, onTimeframeChange }) {
  const containerId = `tv_chart_${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const widgetRef = useRef(null);
  const readyRef = useRef(false);

  // Create the widget once on mount.
  useEffect(() => {
    let cancelled = false;
    loadTradingViewScript().then(() => {
      if (cancelled || !window.TradingView) return;
      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: `BINANCE:${symbol}`,
        interval: INTERVAL_MAP[timeframe] || '5',
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        toolbar_bg: '#0a0e17',
        enable_publishing: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        withdateranges: true,
        container_id: containerId,
      });
      widgetRef.current.onChartReady(() => {
        readyRef.current = true;
      });
    });
    return () => {
      cancelled = true;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  // Keep the widget in sync when our own symbol/timeframe dropdowns change.
  // (One-way: if the user changes symbol from inside TradingView's own UI,
  // our dropdowns won't know about it -- the embed doesn't expose that back.)
  useEffect(() => {
    if (!readyRef.current || !widgetRef.current) return;
    try {
      widgetRef.current.chart().setSymbol(`BINANCE:${symbol}`, () => {});
    } catch {
      // Chart not ready yet or was torn down -- next symbol change will retry.
    }
  }, [symbol]);

  useEffect(() => {
    if (!readyRef.current || !widgetRef.current) return;
    try {
      widgetRef.current.chart().setResolution(INTERVAL_MAP[timeframe] || '5', () => {});
    } catch {
      // Same as above.
    }
  }, [timeframe]);

  return (
    <div className="panel chart-panel">
      <div className="panel-title chart-controls">
        <span>{symbol} · {timeframe} · TradingView</span>
        <div className="chart-selects">
          <select value={symbol} onChange={(e) => onSymbolChange(e.target.value)}>
            {(symbols.length ? symbols : [symbol]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={timeframe} onChange={(e) => onTimeframeChange(e.target.value)}>
            {timeframes.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>
      </div>
      <div id={containerId} style={{ height: 560 }} />
    </div>
  );
}
