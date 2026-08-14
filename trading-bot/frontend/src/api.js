import { demoApi, start as startDemoSimulator, tradesToCsv as demoTradesToCsv } from './demo/simulator.js';

// Same-origin '/api' works when the frontend and backend are served from the
// same host (local dev via the Vite proxy, or a VPS serving both). A
// Vercel-hosted frontend talking to a backend on a different host needs this
// set explicitly -- see README "Connecting a hosted frontend to a real backend".
const BASE = import.meta.env.VITE_API_BASE || '/api';

let demoMode = false;

function enableDemoMode() {
  if (demoMode) return;
  demoMode = true;
  startDemoSimulator();
}

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request to ${path} failed (${res.status})`);
  }
  return res.json();
}

// If a real backend is reachable, every call below goes straight to it --
// nothing changes from a plain single-user deployment. If it isn't (no
// backend running, e.g. a static hosted preview), the very first call here
// (always api.getState(), from App.jsx's initial load) flips into demo
// mode and every call after that -- from any component, with no special
// handling needed in the component itself -- transparently runs against
// the real-market-data, real-execution-logic browser simulator instead.
export const api = {
  isDemoMode: () => demoMode,

  getState: async () => {
    try {
      return await request('/state');
    } catch {
      enableDemoMode();
      return demoApi.getState();
    }
  },
  getSymbols: () => (demoMode ? demoApi.getSymbols() : request('/symbols')),
  getPrice: (symbol) => (demoMode ? demoApi.getPrice(symbol) : request(`/price/${symbol}`)),
  getSignals: (limit = 50) => (demoMode ? demoApi.getSignals(limit) : request(`/signals?limit=${limit}`)),
  getPendingSignals: () => (demoMode ? demoApi.getPendingSignals() : request('/signals/pending')),
  approveSignal: (id) => (demoMode ? demoApi.approveSignal(id) : request(`/signals/${id}/approve`, { method: 'POST' })),
  rejectSignal: (id) => (demoMode ? demoApi.rejectSignal(id) : request(`/signals/${id}/reject`, { method: 'POST' })),
  getOpenTrades: () => (demoMode ? demoApi.getOpenTrades() : request('/trades/open')),
  getTradeHistory: (limit = 20) => (demoMode ? demoApi.getTradeHistory(limit) : request(`/trades/history?limit=${limit}`)),
  closeTrade: (id) => (demoMode ? demoApi.closeTrade(id) : request(`/trades/${id}/close`, { method: 'POST' })),
  placeManualTrade: (order) => (demoMode ? demoApi.placeManualTrade(order) : request('/trades/manual', { method: 'POST', body: JSON.stringify(order) })),
  emergencyStop: (reason) => (demoMode ? demoApi.emergencyStop(reason) : request('/emergency-stop', { method: 'POST', body: JSON.stringify({ reason }) })),
  clearEmergencyStop: () => (demoMode ? demoApi.clearEmergencyStop() : request('/emergency-stop/clear', { method: 'POST' })),
  setManualApproval: (enabled) => (demoMode ? demoApi.setManualApproval(enabled) : request('/settings/manual-approval', { method: 'POST', body: JSON.stringify({ enabled }) })),
  resetBalance: () => (demoMode ? demoApi.resetBalance() : request('/reset-balance', { method: 'POST' })),
  getMetrics: () => (demoMode ? demoApi.getMetrics() : request('/metrics')),
  riskCalculator: (entry, stopLoss) => (demoMode ? demoApi.riskCalculator(entry, stopLoss) : request('/risk-calculator', { method: 'POST', body: JSON.stringify({ entry, stopLoss }) })),

  // CSV export can't be a plain download link in demo mode (no server to hit) --
  // TradeHistory.jsx checks isDemoMode() and calls exportCsvNow() instead.
  exportCsvUrl: () => `${BASE}/export/csv`,
  exportCsvNow: () => demoTradesToCsv(),
};
