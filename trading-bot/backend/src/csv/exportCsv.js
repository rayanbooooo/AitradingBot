const { statements } = require('../db/db');

const COLUMNS = [
  'id', 'symbol', 'direction', 'mode', 'opened_at', 'closed_at',
  'signal_price', 'entry_price', 'slippage', 'quantity',
  'stop_loss', 'take_profit', 'exit_price', 'pnl_usdt', 'pnl_percent', 'status',
];

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function tradesToCsv() {
  const trades = statements.allClosedTrades.all();
  const header = COLUMNS.join(',');
  const rows = trades.map((t) => COLUMNS.map((c) => escapeCsv(t[c])).join(','));
  return [header, ...rows].join('\n');
}

module.exports = { tradesToCsv };
