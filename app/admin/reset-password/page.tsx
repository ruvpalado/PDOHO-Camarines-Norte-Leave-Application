'use client';

import { useState, useEffect, FormEvent } from 'react';
import Letterhead from '@/components/Letterhead';

export default function ResetPasswordPage() {
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [linkValid, setLinkValid] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const u = params.get('username') || '';
    const t = params.get('token') || '';
    setUsername(u);
    setToken(t);
    if (!u || !t) setLinkValid(false);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not reset the password.');
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Could not reset the password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 460 }}>
      <Letterhead />
      <h1 style={{ textAlign: 'center' }}>Reset Admin Password</h1>

      {!linkValid ? (
        <div className="err-banner">
          This password reset link is missing required information. Please request a new one from the{' '}
          <a href="/admin/login">Admin Login</a> page.
        </div>
      ) : success ? (
        <div className="ok-banner">
          Your password has been reset. You can now <a href="/admin/login">sign in</a> with your new password.
        </div>
      ) : (
        <form className="card" onSubmit={handleSubmit}>
          <p className="sub" style={{ marginTop: 0 }}>
            Resetting password for admin account <strong>{username}</strong>.
          </p>
          {error && <div className="err-banner">{error}</div>}
          <div className="field">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting} style={{ marginTop: 16, width: '100%' }}>
            {submitting ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      )}

      <p style={{ textAlign: 'center', fontSize: 12, marginTop: 16 }}>
        <a href="/admin/login">Back to Admin Login</a>
      </p>
    </div>
  );
}
