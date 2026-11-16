'use client';

import { useEffect, useState, useCallback } from 'react';
import { LEAVE_TYPES } from '@/lib/leaveTypes';

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

  const [editing, setEditing] = useState<Application | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  function openEdit(a: Application) {
    setEditError('');
    setForm({
      last_name: a.last_name || '',
      first_name: a.first_name || '',
      middle_name: a.middle_name || '',
      position: a.position || '',
      salary: a.salary || '',
      email: a.email || '',
      facility_name: a.facility_name || '',
      leave_type: a.leave_type || '',
      details_category: a.details_category || '',
      details_specify: a.details_specify || '',
      start_date: fmtDate(a.start_date),
      end_date: fmtDate(a.end_date),
      days_applied: String(a.days_applied ?? ''),
      commutation: a.commutation || 'Not Requested',
    });
    setEditing(a);
  }

  function setField(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const res = await fetch(`/api/applications/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', fields: form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Could not save changes.');
        return;
      }
      setEditing(null);
      load(tab);
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeApp(a: Application) {
    const ref = `LM-${String(a.id).padStart(4, '0')}`;
    if (!window.confirm(`Delete ${ref} (${a.last_name}, ${a.first_name})? This cannot be undone.`)) return;
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/applications/${a.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) alert(data.error || 'Delete failed.');
      else load(tab);
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
          <a href="/admin/accounts" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Admin Accounts
          </a>
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
                  <th>Actions</th>
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
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {tab === 'pending' && (
                        <>
                          <button className="btn-primary" disabled={busyId === a.id} onClick={() => decide(a.id, 'approve')}>
                            Approve
                          </button>{' '}
                          <button className="btn-danger" disabled={busyId === a.id} onClick={() => decide(a.id, 'reject')}>
                            Reject
                          </button>{' '}
                        </>
                      )}
                      {tab === 'approved' && (
                        <>
                          <button className="btn-danger" disabled={busyId === a.id} onClick={() => decide(a.id, 'cancel')}>
                            Cancel
                          </button>{' '}
                        </>
                      )}
                      <button className="btn-secondary" disabled={busyId === a.id} onClick={() => openEdit(a)}>
                        Edit
                      </button>{' '}
                      <button className="btn-danger" disabled={busyId === a.id} onClick={() => removeApp(a)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: 24,
            overflowY: 'auto',
            zIndex: 50,
          }}
          onClick={() => !savingEdit && setEditing(null)}
        >
          <form
            className="card"
            onSubmit={saveEdit}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 900, margin: '24px 0' }}
          >
            <div className="topbar" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>
                Edit LM-{String(editing.id).padStart(4, '0')}
              </h2>
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)} disabled={savingEdit}>
                Close
              </button>
            </div>

            {editError && <div className="err-banner">{editError}</div>}

            <div className="row">
              <div className="field">
                <label className="req">Last Name</label>
                <input value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} required />
              </div>
              <div className="field">
                <label className="req">First Name</label>
                <input value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} required />
              </div>
              <div className="field">
                <label>Middle Name</label>
                <input value={form.middle_name} onChange={(e) => setField('middle_name', e.target.value)} />
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
              </div>
              <div className="field">
                <label>Position</label>
                <input value={form.position} onChange={(e) => setField('position', e.target.value)} />
              </div>
              <div className="field">
                <label>Salary</label>
                <input type="number" value={form.salary} onChange={(e) => setField('salary', e.target.value)} />
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label>Facility</label>
                <input value={form.facility_name} onChange={(e) => setField('facility_name', e.target.value)} />
              </div>
              <div className="field">
                <label className="req">Type of Leave</label>
                <select value={form.leave_type} onChange={(e) => setField('leave_type', e.target.value)} required>
                  <option value="">Select...</option>
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Commutation</label>
                <select value={form.commutation} onChange={(e) => setField('commutation', e.target.value)}>
                  <option>Not Requested</option>
                  <option>Requested</option>
                </select>
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label>Details Category</label>
                <input value={form.details_category} onChange={(e) => setField('details_category', e.target.value)} />
              </div>
              <div className="field">
                <label>Details Specify</label>
                <input value={form.details_specify} onChange={(e) => setField('details_specify', e.target.value)} />
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label className="req">Leave Start Date</label>
                <input type="date" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} required />
              </div>
              <div className="field">
                <label className="req">Leave End Date</label>
                <input type="date" value={form.end_date} onChange={(e) => setField('end_date', e.target.value)} required />
              </div>
              <div className="field">
                <label className="req">Working Days Applied</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.days_applied}
                  onChange={(e) => setField('days_applied', e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)} disabled={savingEdit}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
