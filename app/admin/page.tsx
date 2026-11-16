'use client';

import { useEffect, useState, useCallback } from 'react';

type Application = {
  id: number;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  email: string | null;
  date_filed: string | null;
  position: string | null;
  salary: string | null;
  leave_type: string;
  details_category: string | null;
  details_specify: string | null;
  facility_name: string | null;
  attachment_filename: string | null;
  has_attachment: boolean;
  start_date: string;
  end_date: string;
  days_applied: string;
  commutation: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  submitted_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
};

type TabKey = 'pending' | 'approved' | 'rejected' | 'cancelled';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: 'For Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
];

function fmtDate(v: string | null) {
  if (!v) return '';
  return v.slice(0, 10);
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<TabKey>('pending');
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async (which: TabKey) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/applications?status=${which}`, { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load applications.');
      setApps(data.applications || []);
    } catch (err: any) {
      setLoadError(err.message || 'Could not load applications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function decide(id: number, action: 'approve' | 'reject' | 'cancel') {
    let note: string | null = null;
    if (action === 'reject') {
      note = window.prompt('Optional: reason for rejecting this application (leave blank to skip).');
      if (note === null) return; // user cancelled the prompt
    }
    if (action === 'cancel') {
      note = window.prompt(
        'Cancel this approved leave application? The leave credits will be restored. Optional: reason for cancelling (leave blank to skip).'
      );
      if (note === null) return; // user cancelled the prompt
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Action failed.');
      } else {
        load(tab);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <h1>Leave Applications - Admin</h1>
          <p className="sub">DOH - Bicol Center for Health Development</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={logout}>
            Log Out
          </button>
        </div>
      </div>

      <div className="tabs">
        <div style={{ display: 'flex', gap: 8 }}>
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'tab active' : 'tab'} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/admin/reports" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Generate Report
          </a>
          <a href="/admin/balances" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Upload Leave Balance
          </a>
        </div>
      </div>

      <div className="card" style={{ borderTopLeftRadius: 0 }}>
        {loadError && <div className="err-banner">{loadError}</div>}
        {loading ? (
          <p>Loading...</p>
        ) : apps.length === 0 ? (
          <p style={{ color: '#595959', fontSize: 12.5 }}>No records in this list.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Type of Leave</th>
                  <th>Details</th>
                  <th>Facility</th>
                  <th>Email</th>
                  <th>Attachment</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Days</th>
                  <th>Submitted</th>
                  {tab !== 'pending' && <th>Decided By / When</th>}
                  {tab === 'cancelled' && <th>Cancelled By / When</th>}
                  {(tab === 'rejected' || tab === 'cancelled') && <th>Reason</th>}
                  {(tab === 'pending' || tab === 'approved') && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id}>
                    <td>LM-{String(a.id).padStart(4, '0')}</td>
                    <td>
                      {a.last_name}, {a.first_name}
                    </td>
                    <td>{a.position || ''}</td>
                    <td>{a.leave_type}</td>
                    <td>
                      {a.details_category || ''}
                      {a.details_specify ? ' - ' + a.details_specify : ''}
                    </td>
                    <td>{a.facility_name || ''}</td>
                    <td>{a.email || ''}</td>
                    <td>
                      {a.has_attachment ? (
                        <a
                          href={`/api/applications/${a.id}/attachment`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary"
                          style={{ display: 'inline-block', padding: '3px 8px', fontSize: 11, textDecoration: 'none' }}
                        >
                          Download
                        </a>
                      ) : (
                        ''
                      )}
                    </td>
                    <td>{fmtDate(a.start_date)}</td>
                    <td>{fmtDate(a.end_date)}</td>
                    <td>{a.days_applied}</td>
                    <td>{new Date(a.submitted_at).toLocaleString()}</td>
                    {tab !== 'pending' && (
                      <td>
                        {a.decided_by || ''}
                        {a.decided_at ? ' - ' + new Date(a.decided_at).toLocaleString() : ''}
                      </td>
                    )}
                    {tab === 'cancelled' && (
                      <td>
                        {a.cancelled_by || ''}
                        {a.cancelled_at ? ' - ' + new Date(a.cancelled_at).toLocaleString() : ''}
                      </td>
                    )}
                    {tab === 'rejected' && <td>{a.decision_note || ''}</td>}
                    {tab === 'cancelled' && <td>{a.cancel_reason || ''}</td>}
                    {tab === 'pending' && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn-primary" disabled={busyId === a.id} onClick={() => decide(a.id, 'approve')}>
                          Approve
                        </button>{' '}
                        <button className="btn-danger" disabled={busyId === a.id} onClick={() => decide(a.id, 'reject')}>
                          Reject
                        </button>
                      </td>
                    )}
                    {tab === 'approved' && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn-danger" disabled={busyId === a.id} onClick={() => decide(a.id, 'cancel')}>
                          Cancel
                        </button>
                      </td>
                    )}
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
