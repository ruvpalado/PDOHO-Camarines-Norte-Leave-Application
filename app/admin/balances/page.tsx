'use client';

import { useEffect, useState, useCallback, FormEvent, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { LEAVE_TYPES } from '@/lib/leaveTypes';

type BalanceRow = {
  id: number;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  leave_type: string;
  opening_balance: string;
  set_at: string;
  updated_by: string | null;
  used: string;
  available: number;
};

type UploadResult = {
  total: number;
  succeeded: number;
  failed: number;
  errors: { row: number; reason: string }[];
};

const initialForm = {
  lastName: '',
  firstName: '',
  middleName: '',
  leaveType: '',
  openingBalance: '',
};

// Matches uploaded column headers to our field names, ignoring case/spacing so files like
// "Last Name", "LAST NAME", "Surname", "Type of Leave", or "Balance" all work.
const HEADER_ALIASES: Record<string, string> = {
  lastname: 'lastName',
  surname: 'lastName',
  familyname: 'lastName',
  firstname: 'firstName',
  givenname: 'firstName',
  middlename: 'middleName',
  mi: 'middleName',
  leavetype: 'leaveType',
  typeofleave: 'leaveType',
  openingbalance: 'openingBalance',
  balance: 'openingBalance',
  leavebalance: 'openingBalance',
  availablebalance: 'openingBalance',
  days: 'openingBalance',
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z]/g, '');
}

export default function LeaveBalancesAdminPage() {
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFileKey, setUploadFileKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/leave-balances', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load leave balances.');
      setRows(data.balances || []);
    } catch (err: any) {
      setLoadError(err.message || 'Could not load leave balances.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function update<K extends keyof typeof initialForm>(field: K, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.lastName || !form.firstName || !form.leaveType || form.openingBalance === '') {
      setSaveMsg({ type: 'err', msg: 'Last Name, First Name, Leave Type, and Opening Balance are all required.' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/leave-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastName: form.lastName,
          firstName: form.firstName,
          middleName: form.middleName,
          leaveType: form.leaveType,
          openingBalance: Number(form.openingBalance),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      setSaveMsg({ type: 'ok', msg: 'Balance saved.' });
      setForm(initialForm);
      load();
    } catch (err: any) {
      setSaveMsg({ type: 'err', msg: err.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  function editRow(r: BalanceRow) {
    setForm({
      lastName: r.last_name,
      firstName: r.first_name,
      middleName: r.middle_name || '',
      leaveType: r.leave_type,
      openingBalance: r.opening_balance,
    });
    setSaveMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleUploadFileChange(e: ChangeEvent<HTMLInputElement>) {
    setUploadFile(e.target.files?.[0] || null);
    setUploadMsg(null);
    setUploadResult(null);
  }

  async function handleUpload() {
    if (!uploadFile) {
      setUploadMsg({ type: 'err', msg: 'Please choose a CSV or Excel file first.' });
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    setUploadResult(null);
    try {
      const buffer = await uploadFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('The file has no sheets to read.');
      const sheet = workbook.Sheets[sheetName];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawRows.length === 0) {
        throw new Error('The file has no data rows. Make sure the first row has column headers.');
      }

      const records = rawRows.map((row) => {
        const mapped: Record<string, any> = {};
        for (const key of Object.keys(row)) {
          const target = HEADER_ALIASES[normalizeHeader(key)];
          if (target) mapped[target] = row[key];
        }
        return mapped;
      });

      const res = await fetch('/api/admin/leave-balances/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');

      setUploadResult({ total: data.total, succeeded: data.succeeded, failed: data.failed, errors: data.errors || [] });
      setUploadMsg({
        type: data.failed > 0 ? 'err' : 'ok',
        msg:
          data.failed > 0
            ? `Uploaded ${data.succeeded} of ${data.total} row(s). ${data.failed} row(s) had errors - see details below.`
            : `Uploaded ${data.succeeded} of ${data.total} row(s) successfully. The Leave Application page will now use these balances.`,
      });
      setUploadFile(null);
      setUploadFileKey((k) => k + 1);
      load();
    } catch (err: any) {
      setUploadMsg({ type: 'err', msg: err.message || 'Could not process the uploaded file.' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <h1>Upload Leave Balance - Admin</h1>
          <p className="sub">Upload a file or manually set each employee's opening leave-credit balance per leave type.</p>
        </div>
        <a href="/admin" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          Back to Applications
        </a>
      </div>

      <div className="card">
        <h2 style={{ margin: '0 0 4px', color: '#1F4E78', fontSize: 15 }}>Upload Leave Balance File</h2>
        <p className="sub" style={{ marginTop: 0 }}>
          Upload a CSV or Excel file to set opening leave balances for many employees at once. These values become
          the basis for the automatic Leave Balance computation on the main Leave Application page. Required
          columns: Last Name, First Name, Leave Type, Opening Balance (Middle Name is optional). Column names are
          matched flexibly - "Balance", "Days", "Surname", and "Type of Leave" are also recognized.
        </p>
        {uploadMsg && <div className={uploadMsg.type === 'ok' ? 'ok-banner' : 'err-banner'}>{uploadMsg.msg}</div>}
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '2 1 320px' }}>
            <label>CSV or Excel File</label>
            <input key={uploadFileKey} type="file" accept=".csv,.xlsx,.xls" onChange={handleUploadFileChange} />
          </div>
          <div className="field" style={{ maxWidth: 160, flex: '0 0 auto' }}>
            <button
              className="btn-primary"
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              style={{ width: '100%' }}
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </div>
        {uploadResult && uploadResult.errors.length > 0 && (
          <div className="tablewrap" style={{ marginTop: 12, maxHeight: 220 }}>
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Issue</th>
                </tr>
              </thead>
              <tbody>
                {uploadResult.errors.map((e, idx) => (
                  <tr key={idx}>
                    <td>{e.row}</td>
                    <td>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <h2 style={{ margin: '0 0 4px', color: '#1F4E78', fontSize: 15 }}>Or Add / Edit a Single Record Manually</h2>
        <p className="sub" style={{ marginTop: 0 }}>
          Enter the employee's current balance for a leave type as of today. Saving resets the "as of" date, so
          only leaves approved after this point will be deducted automatically going forward.
        </p>
        {saveMsg && <div className={saveMsg.type === 'ok' ? 'ok-banner' : 'err-banner'}>{saveMsg.msg}</div>}
        <div className="row">
          <div className="field">
            <label className="req">Last Name</label>
            <input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
          </div>
          <div className="field">
            <label className="req">First Name</label>
            <input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
          </div>
          <div className="field">
            <label>Middle Name</label>
            <input value={form.middleName} onChange={(e) => update('middleName', e.target.value)} />
          </div>
          <div className="field">
            <label className="req">Leave Type</label>
            <select value={form.leaveType} onChange={(e) => update('leaveType', e.target.value)}>
              <option value="">Select...</option>
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="req">Opening Balance (days)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.openingBalance}
              onChange={(e) => update('openingBalance', e.target.value)}
            />
          </div>
        </div>
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Balance'}
        </button>
      </form>

      <div className="card">
        {loadError && <div className="err-banner">{loadError}</div>}
        {loading ? (
          <p>Loading...</p>
        ) : rows.length === 0 ? (
          <p style={{ color: '#595959', fontSize: 12.5 }}>No leave balances configured yet.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Leave Type</th>
                  <th>Opening Balance</th>
                  <th>Used Since</th>
                  <th>Available</th>
                  <th>As Of</th>
                  <th>Set By</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.last_name}, {r.first_name} {r.middle_name || ''}
                    </td>
                    <td>{r.leave_type}</td>
                    <td>{r.opening_balance}</td>
                    <td>{r.used}</td>
                    <td>{r.available}</td>
                    <td>{new Date(r.set_at).toLocaleDateString()}</td>
                    <td>{r.updated_by || ''}</td>
                    <td>
                      <button className="btn-secondary" onClick={() => editRow(r)}>
                        Edit
                      </button>
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
