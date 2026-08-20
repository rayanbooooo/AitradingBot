import React from 'react';

// Without this, any uncaught error anywhere in the tree unmounts everything
// and leaves a silent black page -- indistinguishable from the app just
// being broken, with no way for a user to tell us what happened.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Uncaught error in app tree:', error, info); // eslint-disable-line no-console
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', background: '#0a0e17', color: '#e8f4f8', fontFamily: 'monospace',
          textAlign: 'center', padding: 24,
        }}>
          <h1 style={{ color: '#ff2d55', fontSize: 20, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ maxWidth: 480, opacity: 0.8, marginBottom: 16 }}>
            {this.state.error.message || 'An unexpected error crashed the dashboard.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#00e5ff', color: '#0a0e17', border: 'none', padding: '10px 20px',
              borderRadius: 4, cursor: 'pointer', fontWeight: 700,
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
