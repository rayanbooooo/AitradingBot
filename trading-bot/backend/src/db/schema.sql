CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL,              -- LONG | SHORT
  score INTEGER NOT NULL,
  entry_price REAL NOT NULL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  risk_reward REAL NOT NULL,
  reasons TEXT NOT NULL,                -- JSON array of why it triggered
  source TEXT NOT NULL,                 -- SCANNER | TRADINGVIEW_WEBHOOK
  status TEXT NOT NULL DEFAULT 'PENDING' -- PENDING | APPROVED | REJECTED | EXECUTED | EXPIRED
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id INTEGER,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  signal_price REAL NOT NULL,
  entry_price REAL NOT NULL,
  slippage REAL,
  quantity REAL NOT NULL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  exit_price REAL,
  pnl_usdt REAL,
  pnl_percent REAL,
  status TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | CLOSED_TP | CLOSED_SL | CLOSED_MANUAL | CLOSED_TIME_DECAY | CLOSED_EMERGENCY
  mode TEXT NOT NULL,                   -- LIVE | PAPER
  broker_order_id TEXT,
  trailing_stop_active INTEGER DEFAULT 0,
  FOREIGN KEY (signal_id) REFERENCES signals (id)
);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT
);

CREATE INDEX IF NOT EXISTS idx_trades_status ON trades (status);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals (symbol);
