import React, { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const { error: err } = await signUp(email, password);
        if (err) throw err;
        setNotice('Check your email to confirm your account, then sign in.');
        setMode('signin');
      } else {
        const { error: err } = await signIn(email, password);
        if (err) throw err;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function forgotPassword() {
    if (!email) return setError('Enter your email above first, then click "Forgot password".');
    setError(null);
    setNotice(null);
    try {
      const { error: err } = await resetPassword(email);
      if (err) throw err;
      setNotice('Password reset email sent.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-screen">
      <div className="hud-bg" aria-hidden="true">
        <div className="hud-glow-a" />
        <div className="hud-glow-b" />
        <div className="hud-scanline" />
      </div>
      <div className="panel login-panel">
        <div className="panel-title">{mode === 'signup' ? 'Create Account' : 'Sign In'}</div>
        <form onSubmit={submit} className="risk-form">
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Please wait...' : mode === 'signup' ? 'Sign Up' : 'Sign In'}
          </button>
        </form>
        {error && <div className="error-text">{error}</div>}
        {notice && <div className="risk-result positive">{notice}</div>}
        <div className="login-links">
          {mode === 'signin' ? (
            <>
              <button type="button" className="link-btn" onClick={() => { setMode('signup'); setError(null); setNotice(null); }}>
                Need an account? Sign up
              </button>
              <button type="button" className="link-btn" onClick={forgotPassword}>Forgot password?</button>
            </>
          ) : (
            <button type="button" className="link-btn" onClick={() => { setMode('signin'); setError(null); setNotice(null); }}>
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
