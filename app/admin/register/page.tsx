'use client';

import { useState, FormEvent } from 'react';
import Letterhead from '@/components/Letterhead';

export default function AdminRegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit the registration.');
      setSuccess(data.message || 'Registration submitted. Your account will be reviewed before you can sign in.');
    } catch (err: any) {
      setError(err.message || 'Could not submit the registration.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 460 }}>
      <Letterhead />
      <h1 style={{ textAlign: 'center' }}>Admin Registration</h1>
      <p className="sub" style={{ textAlign: 'center' }}>
        Request an admin account. A system administrator must approve your registration before you can sign in.
      </p>

      {success ? (
        <div className="ok-banner">{success}</div>
      ) : (
        <form className="card" onSubmit={handleSubmit}>
          {error && <div className="err-banner">{error}</div>}
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting} style={{ marginTop: 16, width: '100%' }}>
            {submitting ? 'Submitting...' : 'Register'}
          </button>
        </form>
      )}

      <p style={{ textAlign: 'center', fontSize: 12, marginTop: 16 }}>
        <a href="/admin/login">Back to Admin Login</a>
      </p>
    </div>
  );
}
