import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useWebSocket } from './useWebSocket.js';
import { useAuth } from './AuthContext.jsx';
import Login from './components/Login.jsx';
import Header from './components/Header.jsx';
import PriceChart from './components/PriceChart.jsx';
import MarketScanner from './components/MarketScanner.jsx';
import ApprovalQueue from './components/ApprovalQueue.jsx';
import ActiveTrades from './components/ActiveTrades.jsx';
import TradeHistory from './components/TradeHistory.jsx';
import AccountMetrics from './components/AccountMetrics.jsx';
import HeatMap from './components/HeatMap.jsx';
import RiskCalculator from './components/RiskCalculator.jsx';
import ManualTradePanel from './components/ManualTradePanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import AlertFeed from './components/AlertFeed.jsx';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default function App() {
  const { enabled: authEnabled, loading: authLoading, user, signOut } = useAuth();
  const [appState, setAppState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [signals, setSignals] = useState([]);
  const [pending, setPending] = useState([]);
  const [openTrades, setOpenTrades] = useState([]);
  const [history, setHistory] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [symbols, setSymbols] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [selectedTimeframe, setSelectedTimeframe] = useState('5m');
  const [livePrices, setLivePrices] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [demoMode, setDemoMode] = useState(false);

  const refreshAll = useCallback(async () => {
    const [s, p, o, h, m] = await Promise.all([
      api.getSignals(50), api.getPendingSignals(), api.getOpenTrades(), api.getTradeHistory(20), api.getMetrics(),
    ]);
    setSignals(s); setPending(p); setOpenTrades(o); setHistory(h); setMetrics(m);
  }, []);

  useEffect(() => {
    // api.getState() transparently falls back to the real-data browser demo
    // simulator if no backend is reachable -- isDemoMode() reflects that
    // decision right after this resolves, no separate fallback data needed here.
    api.getState().then((s) => {
      setAppState(s);
      setDemoMode(api.isDemoMode());
    });
    api.getSymbols().then(setSymbols).catch(() => {});
    refreshAll().catch(() => {});
    const poll = setInterval(() => refreshAll().catch(() => {}), 30000);
    return () => clearInterval(poll);
  }, [refreshAll]);

  useEffect(() => {
    let cancelled = false;
    async function pollPrices() {
      const syms = [...new Set(openTrades.map((t) => t.symbol))];
      const entries = await Promise.all(syms.map(async (sym) => {
        try { return [sym, (await api.getPrice(sym)).price]; } catch { return [sym, null]; }
      }));
      if (!cancelled) setLivePrices(Object.fromEntries(entries));
    }
    pollPrices();
    const interval = setInterval(pollPrices, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [openTrades]);

  const pushAlert = useCallback((level, text) => {
    setAlerts((prev) => [{ level, text, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  }, []);

  useWebSocket(useCallback((msg) => {
    setConnected(true);
    switch (msg.type) {
      case 'state':
        setAppState(msg.payload);
        break;
      case 'newSignal':
        setSignals((prev) => [msg.payload, ...prev].slice(0, 50));
        pushAlert(msg.payload.direction === 'LONG' ? 'buy' : 'sell', `New ${msg.payload.direction} signal: ${msg.payload.symbol} (score ${msg.payload.score})`);
        break;
      case 'awaitingApproval':
        setPending((prev) => [msg.payload, ...prev]);
        break;
      case 'signalRejected':
        pushAlert('info', `Signal rejected: ${msg.payload.symbol} -- ${msg.payload.reason}`);
        break;
      case 'tradeOpened':
        refreshAll();
        pushAlert('buy', `Trade opened: ${msg.payload.symbol} ${msg.payload.direction}`);
        break;
      case 'tradeClosed':
        refreshAll();
        pushAlert(msg.payload.pnl_usdt >= 0 ? 'buy' : 'sell', `Trade closed: ${msg.payload.symbol} PnL ${msg.payload.pnl_usdt.toFixed(2)}`);
        break;
      case 'executionFailed':
        pushAlert('sell', `Execution failed: ${msg.payload.signal.symbol} -- ${msg.payload.error}`);
        break;
      default:
        break;
    }
  }, [pushAlert, refreshAll]));

  async function handleEmergencyStop() {
    if (!window.confirm('This will immediately close ALL open positions at market price. Continue?')) return;
    await api.emergencyStop('Manual emergency stop from dashboard');
    refreshAll();
  }
  async function handleClearStop() {
    await api.clearEmergencyStop();
  }

  if (authEnabled && authLoading) return <div className="loading">Loading...</div>;
  if (authEnabled && !user) return <Login />;
  if (!appState) return <div className="loading">Connecting to backend...</div>;

  return (
    <div className="app">
      <div className="hud-bg" aria-hidden="true">
        <div className="hud-glow-a" />
        <div className="hud-glow-b" />
        <div className="hud-scanline" />
      </div>
      <Header
        appState={appState}
        connected={connected}
        demoMode={demoMode}
        onEmergencyStop={handleEmergencyStop}
        onClearStop={handleClearStop}
        userEmail={authEnabled ? user?.email : null}
        onSignOut={authEnabled ? signOut : null}
      />
      <div className="layout">
        <div className="layout-main">
          <PriceChart
            symbol={selectedSymbol}
            symbols={symbols}
            onSymbolChange={setSelectedSymbol}
            timeframe={selectedTimeframe}
            timeframes={TIMEFRAMES}
            onTimeframeChange={setSelectedTimeframe}
          />
          <ApprovalQueue pending={pending} onResolved={refreshAll} />
          <MarketScanner signals={signals} selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} />
          <ActiveTrades trades={openTrades} livePrices={livePrices} onClosed={refreshAll} />
          <TradeHistory trades={history} demoMode={demoMode} />
        </div>
        <div className="layout-side">
          <AccountMetrics metrics={metrics} />
          <ManualTradePanel symbols={symbols} />
          <HeatMap trades={history} />
          <RiskCalculator />
          <SettingsPanel appState={appState} onChanged={() => api.getState().then(setAppState)} demoMode={demoMode} />
          <AlertFeed alerts={alerts} />
        </div>
      </div>
    </div>
  );
}
