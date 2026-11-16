'use client';

import { useState, useEffect, FormEvent } from 'react';
import Letterhead from '@/components/Letterhead';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState('/admin');

  // Password recovery module: hidden until "Forgot Password?" is clicked, then
  // shown inline right on this page rather than navigating away.
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(params.get('next') || '/admin');
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed.');
      }
      window.location.href = nextPath;
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  function toggleRecovery() {
    setShowRecovery((v) => !v);
    setRecoveryMsg(null);
    setRecoveryUsername((prev) => prev || username);
  }

  async function handleRecoverySubmit(e: FormEvent) {
    e.preventDefault();
    if (!recoveryUsername.trim()) {
      setRecoveryMsg({ type: 'err', msg: 'Please enter your admin username.' });
      return;
    }
    setRecoverySubmitting(true);
    setRecoveryMsg(null);
    try {
      const res = await fetch('/api/admin/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: recoveryUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not process the request.');
      setRecoveryMsg({
        type: 'ok',
        msg: data.message || 'If that username exists, a password reset link has been sent to its registered email address.',
      });
    } catch (err: any) {
      setRecoveryMsg({ type: 'err', msg: err.message || 'Could not process the request.' });
    } finally {
      setRecoverySubmitting(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 460 }}>
      <Letterhead />
      <h1 style={{ textAlign: 'center' }}>Admin Login</h1>
      <p className="sub" style={{ textAlign: 'center' }}>Sign in to review and approve leave applications.</p>

      {error && <div className="err-banner">{error}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 16, width: '100%' }}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={toggleRecovery}
          style={{ marginTop: 10, width: '100%', textAlign: 'center' }}
        >
          Forgot Password?
        </button>
        <a
          href="/admin/register"
          className="btn-secondary"
          style={{
            marginTop: 10,
            width: '100%',
            textAlign: 'center',
            textDecoration: 'none',
            display: 'block',
            boxSizing: 'border-box',
          }}
        >
          Create an Account
        </a>
      </form>

      {showRecovery && (
        <form className="card" onSubmit={handleRecoverySubmit}>
          <h2 style={{ margin: '0 0 4px', color: '#1F4E78', fontSize: 14 }}>Password Recovery</h2>
          <p className="sub" style={{ marginTop: 0 }}>
            Enter your admin username and we&apos;ll email a password reset link to the recovery address on file.
          </p>
          {recoveryMsg && <div className={recoveryMsg.type === 'ok' ? 'ok-banner' : 'err-banner'}>{recoveryMsg.msg}</div>}
          <div className="field">
            <label>Username</label>
            <input value={recoveryUsername} onChange={(e) => setRecoveryUsername(e.target.value)} autoComplete="username" />
          </div>
          <button className="btn-secondary" type="submit" disabled={recoverySubmitting} style={{ marginTop: 12, width: '100%' }}>
            {recoverySubmitting ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      )}

      <p style={{ textAlign: 'center', fontSize: 12 }}>
        <a href="/">Back to the leave application form</a>
      </p>
    </div>
  );
}
