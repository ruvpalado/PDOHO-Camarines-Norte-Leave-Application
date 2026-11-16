'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import Letterhead from '@/components/Letterhead';
import { LEAVE_TYPES, TYPES_WITH_CATEGORY, CATEGORY_MAP } from '@/lib/leaveTypes';

type BalanceInfo =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unconfigured' }
  | { status: 'ok'; available: number };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 MB

type FormState = {
  lastName: string;
  firstName: string;
  middleName: string;
  email: string;
  dateFiled: string;
  position: string;
  salary: string;
  leaveType: string;
  detailsCategory: string;
  detailsSpecify: string;
  facilityName: string;
  startDate: string;
  endDate: string;
  daysApplied: string;
  commutation: string;
};

const initialForm: FormState = {
  lastName: '',
  firstName: '',
  middleName: '',
  email: '',
  dateFiled: '',
  position: '',
  salary: '',
  leaveType: '',
  detailsCategory: '',
  detailsSpecify: '',
  facilityName: '',
  startDate: '',
  endDate: '',
  daysApplied: '',
  commutation: 'Not Requested',
};

// Strips punctuation/spaces and lowercases, so "Dela Cruz-Santos.pdf" and "delacruzsantos"
// compare equal regardless of separators, casing, or extension.
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Requires the attached file's name to contain both the applicant's first and last name
// (in any order, any separators) so staff can't accidentally attach someone else's document.
function filenameMatchesApplicant(filename: string, firstName: string, lastName: string): boolean {
  const base = normalizeForMatch(filename.replace(/\.[^./\\]+$/, ''));
  const fn = normalizeForMatch(firstName);
  const ln = normalizeForMatch(lastName);
  if (!fn || !ln) return false;
  return base.includes(fn) && base.includes(ln);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Counts working days (Mon-Fri) between two "YYYY-MM-DD" dates, inclusive of both
// endpoints. Parsed and iterated in UTC so the count can't drift by a day depending on
// the browser's local timezone or daylight-saving transitions.
function countWorkingDays(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return 0;
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  if (start > end) return 0;
  let count = 0;
  for (let t = start; t <= end; t += 86400000) {
    const day = new Date(t).getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export default function HomePage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState<BalanceInfo>({ status: 'idle' });

  const hasCategory = TYPES_WITH_CATEGORY.includes(form.leaveType);
  const categoryOptions = hasCategory ? CATEGORY_MAP[form.leaveType] : [];

  // Auto-compute the employee's available leave balance whenever their name or the
  // selected leave type changes. Matched by name (no employee login exists), so this
  // is only as reliable as the name typed here matching what the admin set up.
  useEffect(() => {
    const lastName = form.lastName.trim();
    const firstName = form.firstName.trim();
    const leaveType = form.leaveType;
    if (!lastName || !firstName || !leaveType) {
      setBalance({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setBalance({ status: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          lastName,
          firstName,
          middleName: form.middleName.trim(),
          leaveType,
        });
        const res = await fetch(`/api/leave-balance?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setBalance({ status: 'error' });
          return;
        }
        if (!data.configured) {
          setBalance({ status: 'unconfigured' });
        } else {
          setBalance({ status: 'ok', available: data.available });
        }
      } catch {
        if (!cancelled) setBalance({ status: 'error' });
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.lastName, form.firstName, form.middleName, form.leaveType]);

  // Auto-compute Number of Working Days Applied from the selected start/end dates,
  // excluding Saturdays and Sundays. Recomputed any time either date changes.
  useEffect(() => {
    const days = countWorkingDays(form.startDate, form.endDate);
    const next = days > 0 ? String(days) : '';
    setForm((f) => (f.daysApplied === next ? f : { ...f, daysApplied: next }));
  }, [form.startDate, form.endDate]);

  let balanceDisplay = '';
  if (balance.status === 'loading') balanceDisplay = 'Checking...';
  else if (balance.status === 'unconfigured') balanceDisplay = 'Not yet configured - contact Admin';
  else if (balance.status === 'error') balanceDisplay = 'Could not check balance';
  else if (balance.status === 'ok') balanceDisplay = `${balance.available} day(s) available`;

  const daysAppliedNum = Number(form.daysApplied);
  const overBalance =
    balance.status === 'ok' &&
    Number.isFinite(daysAppliedNum) &&
    daysAppliedNum > 0 &&
    daysAppliedNum > balance.available;

  function update<K extends keyof FormState>(field: K, value: string) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'leaveType') {
        const nowHasCategory = TYPES_WITH_CATEGORY.includes(value);
        if (!nowHasCategory) {
          next.detailsCategory = '';
          next.detailsSpecify = '';
        } else if (!CATEGORY_MAP[value].includes(next.detailsCategory)) {
          next.detailsCategory = '';
        }
      }
      return next;
    });
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setAttachment(null);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setStatus({ type: 'err', msg: 'Attached file is too large. Maximum size is 3 MB.' });
      setFileInputKey((k) => k + 1);
      setAttachment(null);
      return;
    }
    if (!form.lastName.trim() || !form.firstName.trim()) {
      setStatus({
        type: 'err',
        msg: 'Please fill in your Last Name and First Name before attaching a file, so we can verify the file belongs to you.',
      });
      setFileInputKey((k) => k + 1);
      setAttachment(null);
      return;
    }
    if (!filenameMatchesApplicant(file.name, form.firstName, form.lastName)) {
      setStatus({
        type: 'err',
        msg: `The attached file's name must include your First Name and Last Name (e.g. "${form.lastName}_${form.firstName}_MedicalCertificate.pdf"). Please rename the file and attach it again.`,
      });
      setFileInputKey((k) => k + 1);
      setAttachment(null);
      return;
    }
    setAttachment(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      !form.lastName ||
      !form.firstName ||
      !form.email ||
      !form.leaveType ||
      !form.startDate ||
      !form.endDate
    ) {
      setStatus({ type: 'err', msg: 'Please fill in all required fields (marked *).' });
      return;
    }
    if (!form.daysApplied) {
      setStatus({
        type: 'err',
        msg: 'The selected date range has no working days (Monday-Friday). Please adjust the Leave Start/End Date.',
      });
      return;
    }
    if (!EMAIL_RE.test(form.email)) {
      setStatus({ type: 'err', msg: 'Please enter a valid email address.' });
      return;
    }
    if (attachment && !filenameMatchesApplicant(attachment.name, form.firstName, form.lastName)) {
      setStatus({
        type: 'err',
        msg: `The attached file's name must include your First Name and Last Name (e.g. "${form.lastName}_${form.firstName}_MedicalCertificate.pdf"). Please rename the file and attach it again.`,
      });
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      let attachmentDataUrl: string | undefined;
      if (attachment) {
        attachmentDataUrl = await fileToDataUrl(attachment);
      }
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          attachmentFileName: attachment?.name,
          attachmentMimeType: attachment?.type,
          attachmentDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed.');
      setStatus({
        type: 'ok',
        msg: `Application submitted (Reference ${data.reference}). It is now pending admin approval. You'll receive an email once it's been decided.`,
      });
      setForm(initialForm);
      setAttachment(null);
      setFileInputKey((k) => k + 1);
    } catch (err: any) {
      setStatus({ type: 'err', msg: err.message || 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wrap">
      <Letterhead />
      <h1 style={{ textAlign: 'center' }}>APPLICATION FOR LEAVE</h1>
      <p className="sub" style={{ textAlign: 'center' }}>
        Submit your leave application below. It will appear in the admin approval queue immediately - no login
        required to submit.
      </p>

      {status && <div className={status.type === 'ok' ? 'ok-banner' : 'err-banner'}>{status.msg}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="row">
          <div className="field">
            <label className="req">Last Name</label>
            <input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} placeholder="Santos" />
          </div>
          <div className="field">
            <label className="req">First Name</label>
            <input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} placeholder="Juan" />
          </div>
          <div className="field">
            <label>Middle Name</label>
            <input value={form.middleName} onChange={(e) => update('middleName', e.target.value)} placeholder="Dela Cruz" />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Facility Name</label>
            <input
              value={form.facilityName}
              onChange={(e) => update('facilityName', e.target.value)}
              placeholder="e.g. BCHD Main Office"
            />
          </div>
          <div className="field">
            <label>Position</label>
            <input value={form.position} onChange={(e) => update('position', e.target.value)} />
          </div>
          <div className="field">
            <label>Salary</label>
            <input type="number" value={form.salary} onChange={(e) => update('salary', e.target.value)} />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Date of Filing</label>
            <input type="date" value={form.dateFiled} onChange={(e) => update('dateFiled', e.target.value)} />
          </div>
          <div className="field">
            <label className="req">Type of Leave</label>
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
            <label>Leave Balance Available</label>
            <input disabled value={balanceDisplay} placeholder="Fill in name & leave type above" />
          </div>
          <div className="field">
            <label>Commutation</label>
            <select value={form.commutation} onChange={(e) => update('commutation', e.target.value)}>
              <option>Not Requested</option>
              <option>Requested</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Details of Leave - Category</label>
            <select
              disabled={!hasCategory}
              value={form.detailsCategory}
              onChange={(e) => update('detailsCategory', e.target.value)}
            >
              <option value="">{hasCategory ? 'Select...' : 'N/A'}</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Details of Leave - Specify</label>
            <input
              disabled={!hasCategory}
              value={form.detailsSpecify}
              onChange={(e) => update('detailsSpecify', e.target.value)}
              placeholder={hasCategory ? '' : 'N/A'}
            />
          </div>
          <div className="field">
            <label className="req">Leave Start Date</label>
            <input type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} />
          </div>
          <div className="field">
            <label className="req">Leave End Date</label>
            <input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label className="req">Number of Working Days Applied</label>
            <input
              disabled
              value={form.daysApplied}
              placeholder="Auto-calculated from leave dates"
            />
            <div style={{ fontSize: 10.5, color: '#9C9C9C', marginTop: 4 }}>
              Automatically counted from the dates above, excluding Saturdays and Sundays.
            </div>
            {overBalance && (
              <div style={{ fontSize: 10.5, color: '#A6291B', marginTop: 4 }}>
                This exceeds your available balance ({balance.status === 'ok' ? balance.available : ''} day(s)).
              </div>
            )}
          </div>
          <div className="field">
            <label className="req">Email Address</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="juan.delacruz@doh.gov.ph"
            />
          </div>
          <div className="field" style={{ flex: '2 1 320px' }}>
            <label>Supporting Document (optional)</label>
            <input
              key={fileInputKey}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleFileChange}
            />
            {attachment && (
              <div style={{ fontSize: 11, color: '#595959', marginTop: 4 }}>
                {attachment.name} ({(attachment.size / 1024).toFixed(0)} KB)
              </div>
            )}
            <div style={{ fontSize: 10.5, color: '#9C9C9C', marginTop: 4 }}>
              e.g. medical certificate, travel order. Accepted: PDF, JPG, PNG, DOC, DOCX. Max size 3 MB.
            </div>
          </div>
        </div>

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Leave Application'}
        </button>
      </form>

      <p style={{ textAlign: 'center', fontSize: 12, marginTop: 16 }}>
        <a href="/admin/login">Admin Login</a>
      </p>
    </div>
  );
}
