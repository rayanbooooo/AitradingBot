// Direct calls to Binance's PUBLIC Futures market-data endpoints from the
// browser -- no API key needed (these are public data, not account data),
// which is what makes a real-data demo possible with no backend at all.
// Kept deliberately light (few symbols, multi-minute polling) to be a
// considerate anonymous API consumer -- see simulator.js for the schedule.
const BASE = 'https://fapi.binance.com/fapi/v1';

export async function fetchKlines(symbol, interval, limit = 200) {
  const res = await fetch(`${BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error(`Binance klines request failed (${res.status})`);
  const raw = await res.json();
  return raw.map((t) => ({
    openTime: t[0],
    open: parseFloat(t[1]),
    high: parseFloat(t[2]),
    low: parseFloat(t[3]),
    close: parseFloat(t[4]),
    volume: parseFloat(t[5]),
    closeTime: t[6],
  }));
}

export async function fetchPrice(symbol) {
  const res = await fetch(`${BASE}/ticker/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Binance price request failed (${res.status})`);
  const data = await res.json();
  return parseFloat(data.price);
}
