// Default scan universe: 50 liquid Binance USDT spot pairs spanning majors,
// large-cap alts, and a few higher-beta names for signal variety. Edit freely.
const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
  'LINKUSDT', 'LTCUSDT', 'TRXUSDT', 'ATOMUSDT', 'UNIUSDT',
  'ETCUSDT', 'XLMUSDT', 'NEARUSDT', 'APTUSDT', 'FILUSDT',
  'ARBUSDT', 'OPUSDT', 'IMXUSDT', 'INJUSDT', 'SUIUSDT',
  'AAVEUSDT', 'MKRUSDT', 'RUNEUSDT', 'FTMUSDT', 'SANDUSDT',
  'MANAUSDT', 'AXSUSDT', 'GALAUSDT', 'EOSUSDT', 'ALGOUSDT',
  'XTZUSDT', 'CHZUSDT', 'THETAUSDT', 'FLOWUSDT', 'KAVAUSDT',
  'GRTUSDT', 'ENJUSDT', 'ZECUSDT', 'DASHUSDT', 'COMPUSDT',
  'SNXUSDT', 'CRVUSDT', '1INCHUSDT', 'BATUSDT', 'ZILUSDT',
];

// Timeframes swept for every symbol on each scan cycle.
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

// The timeframe the 5-minute scan loop treats as the primary trigger --
// scoring still reads confluence from the other timeframes above.
const PRIMARY_TIMEFRAME = '5m';

module.exports = { SYMBOLS, TIMEFRAMES, PRIMARY_TIMEFRAME };
