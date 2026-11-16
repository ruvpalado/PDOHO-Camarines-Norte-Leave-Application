'use client';

import { useEffect, useState, useCallback } from 'react';

type IndividualRow = {
  id: number;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  position: string | null;
  facility_name: string | null;
  leave_type: string;
  details_category: string | null;
  details_specify: string | null;
  start_date: string;
  end_date: string;
  days_applied: string;
  commutation: string;
  decided_at: string | null;
  decided_by: string | null;
};

type AggregateRow = {
  leave_type: string;
  staff_count: string;
  applications_count: string;
  total_days: string;
};

type ViewKey = 'individual' | 'aggregate';

function fmtDate(v: string | null) {
  if (!v) return '';
  return v.slice(0, 10);
}

export default function ReportsPage() {
  const [view, setView] = useState<ViewKey>('individual');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [individual, setIndividual] = useState<IndividualRow[]>([]);
  const [aggregate, setAggregate] = useState<AggregateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [appliedFilter, setAppliedFilter] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const load = useCallback(async (fromVal: string, toVal: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      if (fromVal) params.set('from', fromVal);
      if (toVal) params.set('to', toVal);
      const res = await fetch(`/api/admin/reports?${params.toString()}`, { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate the report.');
      setIndividual(data.individual || []);
      setAggregate(data.aggregate || []);
    } catch (err: any) {
      setLoadError(err.message || 'Could not generate the report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('', '');
  }, [load]);

  function applyFilter() {
    setAppliedFilter({ from, to });
    load(from, to);
  }

  function clearFilter() {
    setFrom('');
    setTo('');
    setAppliedFilter({ from: '', to: '' });
    load('', '');
  }

  function handlePrint() {
    window.print();
  }

  const rangeLabel =
    appliedFilter.from || appliedFilter.to
      ? `${appliedFilter.from ? fmtDate(appliedFilter.from) : 'the beginning'} to ${
          appliedFilter.to ? fmtDate(appliedFilter.to) : 'present'
        }`
      : 'All dates';

  return (
    <div className="wrap">
      <div className="topbar no-print">
        <div>
          <h1>Leave Reports - Admin</h1>
          <p className="sub">Reports are based on approved leave applications only.</p>
        </div>
        <a href="/admin" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          Back to Applications
        </a>
      </div>

      <div className="card no-print">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Report View</label>
            <select value={view} onChange={(e) => setView(e.target.value as ViewKey)}>
              <option value="individual">Individual Records</option>
              <option value="aggregate">Aggregate by Leave Type</option>
            </select>
          </div>
          <div className="field" style={{ maxWidth: 180 }}>
            <label>From (leave start date)</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 180 }}>
            <label>To (leave start date)</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 140, flex: '0 0 auto' }}>
            <button className="btn-primary" onClick={applyFilter} disabled={loading} style={{ width: '100%' }}>
              Apply Filter
            </button>
          </div>
          <div className="field" style={{ maxWidth: 120, flex: '0 0 auto' }}>
            <button className="btn-secondary" onClick={clearFilter} disabled={loading} style={{ width: '100%' }}>
              Clear
            </button>
          </div>
          <div className="field" style={{ maxWidth: 120, flex: '0 0 auto' }}>
            <button className="btn-secondary" onClick={handlePrint} style={{ width: '100%' }}>
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="card report-print-area">
        <div className="report-header">
          <h2 style={{ margin: '0 0 2px', color: '#1F4E78', fontSize: 16 }}>
            {view === 'individual' ? 'Individual Approved Leave Records' : 'Aggregate Leave Availment by Type'}
          </h2>
          <p className="sub" style={{ margin: 0 }}>
            DOH - Bicol Center for Health Development &middot; Period: {rangeLabel} &middot; Generated{' '}
            {new Date().toLocaleString()}
          </p>
        </div>

        {loadError && <div className="err-banner" style={{ marginTop: 12 }}>{loadError}</div>}

        {loading ? (
          <p style={{ marginTop: 12 }}>Loading...</p>
        ) : view === 'individual' ? (
          individual.length === 0 ? (
            <p style={{ color: '#595959', fontSize: 12.5, marginTop: 12 }}>No approved leave records found for this period.</p>
          ) : (
            <div className="tablewrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Facility</th>
                    <th>Type of Leave</th>
                    <th>Details</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Days</th>
                    <th>Commutation</th>
                    <th>Approved By / When</th>
                  </tr>
                </thead>
                <tbody>
                  {individual.map((r) => (
                    <tr key={r.id}>
                      <td>LM-{String(r.id).padStart(4, '0')}</td>
                      <td>
                        {r.last_name}, {r.first_name} {r.middle_name || ''}
                      </td>
                      <td>{r.position || ''}</td>
                      <td>{r.facility_name || ''}</td>
                      <td>{r.leave_type}</td>
                      <td>
                        {r.details_category || ''}
                        {r.details_specify ? ' - ' + r.details_specify : ''}
                      </td>
                      <td>{fmtDate(r.start_date)}</td>
                      <td>{fmtDate(r.end_date)}</td>
                      <td>{r.days_applied}</td>
                      <td>{r.commutation}</td>
                      <td>
                        {r.decided_by || ''}
                        {r.decided_at ? ' - ' + new Date(r.decided_at).toLocaleDateString() : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : aggregate.length === 0 ? (
          <p style={{ color: '#595959', fontSize: 12.5, marginTop: 12 }}>No approved leave records found for this period.</p>
        ) : (
          <div className="tablewrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Type of Leave</th>
                  <th>Staff Who Availed</th>
                  <th>Total Applications</th>
                  <th>Total Days Availed</th>
                </tr>
              </thead>
              <tbody>
                {aggregate.map((r) => (
                  <tr key={r.leave_type}>
                    <td>{r.leave_type}</td>
                    <td>{r.staff_count}</td>
                    <td>{r.applications_count}</td>
                    <td>{r.total_days}</td>
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
