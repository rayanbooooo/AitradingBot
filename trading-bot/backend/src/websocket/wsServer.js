const WebSocket = require('ws');
const config = require('../config');
const logger = require('../logger');
const state = require('../state');
const signalEngine = require('../signals/signalEngine');
const executionEngine = require('../execution/executionEngine');

let wss = null;

function broadcast(type, payload) {
  if (!wss) return;
  const message = JSON.stringify({ type, payload, ts: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

function start() {
  wss = new WebSocket.Server({ port: config.server.wsPort });
  logger.info(`WebSocket server listening on :${config.server.wsPort}`);

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'state', payload: state.toPublicJSON(), ts: new Date().toISOString() }));
  });

  state.on('change', () => broadcast('state', state.toPublicJSON()));
  signalEngine.on('newSignal', (signal) => broadcast('newSignal', signal));
  signalEngine.on('awaitingApproval', (signal) => broadcast('awaitingApproval', signal));
  signalEngine.on('signalRejected', (signal) => broadcast('signalRejected', signal));
  executionEngine.on('tradeOpened', (trade) => broadcast('tradeOpened', trade));
  executionEngine.on('tradeClosed', (trade) => broadcast('tradeClosed', trade));
  executionEngine.on('executionFailed', (info) => broadcast('executionFailed', info));

  return wss;
}

module.exports = { start, broadcast };
