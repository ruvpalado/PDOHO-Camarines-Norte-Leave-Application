'use client';

import { useEffect, useState, useCallback } from 'react';

type AdminUser = {
  id: number;
  username: string;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
  deactivated_at: string | null;
  deactivated_by: string | null;
  days_until_deletion: number | null;
};

function fmt(v: string | null) {
  if (!v) return '';
  return new Date(v).toLocaleString();
}

export default function AdminAccountsPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [currentUser, setCurrentUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load accounts.');
      setUsers(data.users || []);
      setCurrentUser(data.currentUser || '');
    } catch (err: any) {
      setError(err.message || 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: number, action: 'approve' | 'reject' | 'deactivate' | 'reactivate') {
    if (action === 'deactivate' && !window.confirm('Deactivate this account? It can be reactivated within 90 days, then will be permanently deleted.')) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || 'Action failed.');
      else load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <h1>Admin Accounts</h1>
          <p className="sub">View accounts, approve requests, deactivate/reactivate. Deactivated accounts auto-delete after 90 days.</p>
        </div>
        <a href="/admin" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          Back to Applications
        </a>
      </div>

      <div className="card">
        {error && <div className="err-banner">{error}</div>}
        {loading ? (
          <p>Loading...</p>
        ) : users.length === 0 ? (
          <p style={{ color: '#595959', fontSize: 12.5 }}>No admin accounts found.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Deactivated</th>
                  <th>Auto-delete in</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}{u.username === currentUser ? ' (you)' : ''}</td>
                    <td>{u.email || ''}</td>
                    <td>{u.role}</td>
                    <td>
                      <span className={`pill pill-${u.status}`}>{u.status}</span>
                    </td>
                    <td>{fmt(u.created_at)}</td>
                    <td>
                      {u.deactivated_at ? `${fmt(u.deactivated_at)}${u.deactivated_by ? ` by ${u.deactivated_by}` : ''}` : ''}
                    </td>
                    <td>{u.status === 'deactivated' && u.days_until_deletion != null ? `${u.days_until_deletion} days` : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {u.status === 'pending' && (
                        <>
                          <button className="btn-primary" disabled={busyId === u.id} onClick={() => act(u.id, 'approve')}>Approve</button>{' '}
                          <button className="btn-danger" disabled={busyId === u.id} onClick={() => act(u.id, 'reject')}>Reject</button>
                        </>
                      )}
                      {u.status === 'active' && u.username !== currentUser && u.role !== 'developer' && (
                        <button className="btn-danger" disabled={busyId === u.id} onClick={() => act(u.id, 'deactivate')}>Deactivate</button>
                      )}
                      {u.status === 'deactivated' && (
                        <button className="btn-primary" disabled={busyId === u.id} onClick={() => act(u.id, 'reactivate')}>Reactivate</button>
                      )}
                      {u.status === 'active' && (u.username === currentUser || u.role === 'developer') && (
                        <span style={{ color: '#595959', fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
