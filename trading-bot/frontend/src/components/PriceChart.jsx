import React, { useEffect, useId, useRef } from 'react';

// TradingView's free embeddable "Advanced Real-Time Chart" widget -- this is
// the actual TradingView UI (pen tool, trendlines, fib retracement, shapes,
// indicators, the whole sidebar), not a lookalike. Loaded from TradingView's
// own CDN, no API key or approval needed (that's only required for their
// separate, heavier "Charting Library" product).
//
// Tradeoff accepted knowingly: this renders TradingView's own market-data
// feed for the symbol, not our backend's candles, so the bot's entry/stop-
// loss/take-profit lines can no longer be drawn directly on it. Use the
// Active Trades panel for exact executed levels; use this chart for
// analysis and drawing.
//
// Symbol/timeframe switching is done by fully recreating the widget with
// new constructor options rather than calling chart().setSymbol()/
// setResolution() on a live instance -- the free embed's support for that
// imperative API turned out to be unreliable in practice (confirmed: the
// dropdowns visibly did nothing). Recreating on prop change is a bit more
// jarring (brief reload flash) but uses the one code path guaranteed to
// work, since it's the same as the initial load.
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
    });

    return () => {
      cancelled = true;
      if (widgetRef.current && typeof widgetRef.current.remove === 'function') {
        try {
          widgetRef.current.remove();
        } catch {
          // Widget may already be torn down by the iframe unmounting -- fine to ignore.
        }
      }
      widgetRef.current = null;
    };
    // Recreate the whole widget on symbol/timeframe change -- see file header.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, symbol, timeframe]);

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
