import { useEffect, useRef } from 'react';

const WS_URL = `ws://${window.location.hostname}:4001`;

/**
 * Subscribes to the backend's WebSocket push feed. Also fires browser
 * desktop notifications for new signals and fills -- this is the reliable
 * notification channel when the backend runs headless/in a container,
 * where node-notifier has no OS notification daemon to talk to.
 */
export function useWebSocket(onMessage) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    let socket;
    let reconnectTimer;

    function connect() {
      socket = new WebSocket(WS_URL);

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handlerRef.current(msg);
        maybeNotify(msg);
      };

      socket.onclose = () => {
        reconnectTimer = setTimeout(connect, 2000);
      };

      socket.onerror = () => socket.close();
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, []);
}

function maybeNotify(msg) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (msg.type === 'newSignal') {
    const s = msg.payload;
    new Notification(`${s.direction === 'LONG' ? '🟢' : '🔴'} New signal: ${s.symbol}`, {
      body: `Score ${s.score} | R:R ${s.risk_reward}:1`,
    });
  } else if (msg.type === 'tradeOpened') {
    const t = msg.payload;
    new Notification(`✅ Trade filled: ${t.symbol}`, { body: `${t.direction} ${t.quantity} @ ${t.entry_price}` });
  } else if (msg.type === 'tradeClosed') {
    const t = msg.payload;
    new Notification(`${t.pnl_usdt >= 0 ? '💰' : '🛑'} Trade closed: ${t.symbol}`, {
      body: `PnL ${t.pnl_usdt >= 0 ? '+' : ''}${t.pnl_usdt.toFixed(2)} USDT`,
    });
  }
}
