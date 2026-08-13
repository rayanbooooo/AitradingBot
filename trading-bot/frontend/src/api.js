const BASE = '/api';

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

export const api = {
  getState: () => request('/state'),
  getSymbols: () => request('/symbols'),
  getCandles: (symbol, timeframe = '5m') => request(`/candles/${symbol}?timeframe=${timeframe}`),
  getPrice: (symbol) => request(`/price/${symbol}`),
  getSignals: (limit = 50) => request(`/signals?limit=${limit}`),
  getPendingSignals: () => request('/signals/pending'),
  approveSignal: (id) => request(`/signals/${id}/approve`, { method: 'POST' }),
  rejectSignal: (id) => request(`/signals/${id}/reject`, { method: 'POST' }),
  getOpenTrades: () => request('/trades/open'),
  getTradeHistory: (limit = 20) => request(`/trades/history?limit=${limit}`),
  closeTrade: (id) => request(`/trades/${id}/close`, { method: 'POST' }),
  emergencyStop: (reason) => request('/emergency-stop', { method: 'POST', body: JSON.stringify({ reason }) }),
  clearEmergencyStop: () => request('/emergency-stop/clear', { method: 'POST' }),
  setManualApproval: (enabled) => request('/settings/manual-approval', { method: 'POST', body: JSON.stringify({ enabled }) }),
  getMetrics: () => request('/metrics'),
  riskCalculator: (entry, stopLoss) => request('/risk-calculator', { method: 'POST', body: JSON.stringify({ entry, stopLoss }) }),
  exportCsvUrl: () => `${BASE}/export/csv`,
};
