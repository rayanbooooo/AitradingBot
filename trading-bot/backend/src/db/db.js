const path = require('path');
const fs = require('fs');
// Node's built-in SQLite (stable, no native compile step -- unlike
// better-sqlite3, which requires a working C++ toolchain on install).
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'trading.db'));
db.exec('PRAGMA journal_mode = WAL');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const statements = {
  insertSignal: db.prepare(`
    INSERT INTO signals
      (created_at, symbol, timeframe, direction, score, entry_price, stop_loss, take_profit, risk_reward, reasons, source, status)
    VALUES (@created_at, @symbol, @timeframe, @direction, @score, @entry_price, @stop_loss, @take_profit, @risk_reward, @reasons, @source, @status)
  `),
  updateSignalStatus: db.prepare(`UPDATE signals SET status = ? WHERE id = ?`),
  getSignal: db.prepare(`SELECT * FROM signals WHERE id = ?`),
  recentSignals: db.prepare(`SELECT * FROM signals ORDER BY created_at DESC LIMIT ?`),
  pendingSignals: db.prepare(`SELECT * FROM signals WHERE status = 'PENDING' ORDER BY created_at DESC`),

  insertTrade: db.prepare(`
    INSERT INTO trades
      (signal_id, opened_at, symbol, direction, signal_price, entry_price, slippage, quantity, stop_loss, take_profit, status, mode, broker_order_id)
    VALUES (@signal_id, @opened_at, @symbol, @direction, @signal_price, @entry_price, @slippage, @quantity, @stop_loss, @take_profit, @status, @mode, @broker_order_id)
  `),
  closeTrade: db.prepare(`
    UPDATE trades SET closed_at = @closed_at, exit_price = @exit_price, pnl_usdt = @pnl_usdt,
      pnl_percent = @pnl_percent, status = @status WHERE id = @id
  `),
  setTrailing: db.prepare(`UPDATE trades SET stop_loss = ?, trailing_stop_active = 1 WHERE id = ?`),
  openTrades: db.prepare(`SELECT * FROM trades WHERE status = 'OPEN'`),
  recentTrades: db.prepare(`SELECT * FROM trades ORDER BY opened_at DESC LIMIT ?`),
  allClosedTrades: db.prepare(`SELECT * FROM trades WHERE status != 'OPEN' ORDER BY closed_at DESC`),

  insertEvent: db.prepare(`INSERT INTO event_log (created_at, level, message, meta) VALUES (?, ?, ?, ?)`),
};

module.exports = { db, statements };
