import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { api } from '../api.js';

export default function PriceChart({ symbol, openTrades }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#0f1420' }, textColor: '#c7ccd6' },
      grid: { vertLines: { color: '#1c2333' }, horzLines: { color: '#1c2333' } },
      width: containerRef.current.clientWidth,
      height: 420,
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => chart.applyOptions({ width: containerRef.current.clientWidth });
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const candles = await api.getCandles(symbol, '5m');
        if (cancelled || !seriesRef.current) return;
        seriesRef.current.setData(
          candles.map((c) => ({
            time: Math.floor(c.openTime / 1000),
            open: c.open, high: c.high, low: c.low, close: c.close,
          }))
        );
        setError(null);
      } catch (e) {
        setError(e.message);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [symbol]);

  // Overlay entry/SL/TP lines for any open positions on the selected symbol.
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setMarkers([]);
    const priceLines = [];
    for (const t of openTrades.filter((t) => t.symbol === symbol)) {
      priceLines.push(
        seriesRef.current.createPriceLine({ price: t.entry_price, color: '#60a5fa', title: 'Entry', lineWidth: 1 }),
        seriesRef.current.createPriceLine({ price: t.stop_loss, color: '#ef4444', title: 'Stop', lineWidth: 1 }),
        seriesRef.current.createPriceLine({ price: t.take_profit, color: '#22c55e', title: 'Target', lineWidth: 1 })
      );
    }
    return () => priceLines.forEach((l) => seriesRef.current?.removePriceLine(l));
  }, [symbol, openTrades]);

  return (
    <div className="panel chart-panel">
      <div className="panel-title">{symbol} · 5m</div>
      {error && <div className="error-text">Chart data unavailable: {error}</div>}
      <div ref={containerRef} />
    </div>
  );
}
