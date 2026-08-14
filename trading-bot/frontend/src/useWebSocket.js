import { useEffect, useRef } from 'react';
import { api } from './api.js';
import { subscribe as subscribeDemoEvents } from './demo/simulator.js';

// Same-origin default assumes the backend's WS server is reachable on the
// current host at :4001 (local dev, or a VPS serving both). A Vercel-hosted
// frontend needs this set explicitly to the backend's wss:// URL -- a page
// served over https cannot open a plain ws:// connection (mixed content).
// See README "Connecting a hosted frontend to a real backend".
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:4001`;

const REAL_WS_MAX_ATTEMPTS = 3;

/**
 * Subscribes to live updates: the backend's real WebSocket push feed when
 * one is reachable, or the browser demo simulator's local event bus when
 * api.js has fallen back to demo mode (same {type, payload} message shape
 * either way, so App.jsx's handler doesn't need to know which is live).
 * Also fires browser desktop notifications for new signals and fills --
 * the reliable channel when a real backend runs headless/in a container,
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
    let attempts = 0;
    let unsubscribeDemo;
    let stopped = false;

    function useDemoBus() {
      unsubscribeDemo = subscribeDemoEvents((msg) => {
        handlerRef.current(msg);
        maybeNotify(msg);
      });
    }

    function connect() {
      if (api.isDemoMode()) {
        useDemoBus();
        return;
      }

      socket = new WebSocket(WS_URL);

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handlerRef.current(msg);
        maybeNotify(msg);
      };

      socket.onclose = () => {
        if (stopped) return;
        attempts += 1;
        // After a few failed attempts, api.js has almost certainly already
        // flipped to demo mode (its own getState() call fails fast) --
        // switch to the demo bus instead of retrying a dead socket forever.
        if (attempts >= REAL_WS_MAX_ATTEMPTS && api.isDemoMode()) {
          useDemoBus();
          return;
        }
        reconnectTimer = setTimeout(connect, 2000);
      };

      socket.onerror = () => socket.close();
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      if (socket) socket.close();
      if (unsubscribeDemo) unsubscribeDemo();
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
