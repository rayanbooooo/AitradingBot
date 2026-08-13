import React from 'react';

export default function AlertFeed({ alerts }) {
  return (
    <div className="panel alert-feed">
      <div className="panel-title">Live Alerts</div>
      <div className="alert-list">
        {alerts.length === 0 && <div className="empty">No activity yet.</div>}
        {alerts.map((a, i) => (
          <div key={i} className={`alert-item alert-${a.level}`}>
            <span className="alert-time">{a.time}</span>
            <span>{a.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
