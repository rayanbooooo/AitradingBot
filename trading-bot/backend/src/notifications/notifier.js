const logger = require('../logger');

let notifier = null;
try {
  // node-notifier requires a desktop notification daemon (notify-send,
  // Notification Center, etc). On a headless server/container this will
  // simply fail silently -- the dashboard's in-browser Notification API
  // (see frontend/src/useWebSocket.js) is the reliable channel there.
  notifier = require('node-notifier');
} catch (e) {
  logger.warn('node-notifier not available, desktop notifications disabled');
}

function notify(title, message) {
  logger.info(`NOTIFY: ${title} -- ${message}`);
  if (!notifier) return;
  try {
    notifier.notify({ title, message, sound: true });
  } catch (e) {
    // Desktop notifications are best-effort; never let this crash the bot.
    logger.warn('Desktop notification failed:', e.message);
  }
}

module.exports = { notify };
