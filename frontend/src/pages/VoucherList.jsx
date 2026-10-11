import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { parseError } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Pagination from '../components/Pagination.jsx';
import { fmtDate, money } from '../utils';

const EMPTY = { search: '', status: '', department: '', category: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' };

// Used for: My Vouchers (employee), All Vouchers (director/accounts), Pending Approvals (director)
export default function VoucherList({ pendingOnly = false }) {
  const { user } = useAuth();
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [sort, setSort] = useState({ sortBy: 'createdAt', order: 'desc' });
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ categories: [], departments: [], statuses: [] });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const title = pendingOnly ? 'Pending Approvals' : user.role === 'EMPLOYEE' ? 'My Vouchers' : 'All Vouchers';
  const showEmployee = user.role !== 'EMPLOYEE';

  useEffect(() => { api.get('/meta').then((r) => setMeta(r.data)).catch(() => {}); }, []);

  // reset when switching between "all" and "pending" pages
  useEffect(() => { setFilters(EMPTY); setApplied(EMPTY); setPage(1); setSort({ sortBy: pendingOnly ? 'submittedAt' : 'createdAt', order: pendingOnly ? 'asc' : 'desc' }); }, [pendingOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = { page, limit: 10, ...sort };
    Object.entries(applied).forEach(([k, v]) => { if (v !== '') params[k] = v; });
    if (pendingOnly) params.status = 'PENDING_APPROVAL';
    if (params.sortBy === 'submittedAt') params.sortBy = 'updatedAt';
    try {
      const { data } = await api.get('/vouchers', { params });
      setResult(data);
    } catch (e) {
      setError(parseError(e).message);
    } finally {
      setLoading(false);
    }
  }, [applied, sort, page, pendingOnly]);

  useEffect(() => { load(); }, [load]);

  const apply = (e) => { e.preventDefault(); setPage(1); setApplied(filters); };
  const reset = () => { setFilters(EMPTY); setApplied(EMPTY); setPage(1); };
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const toggleSort = (key) => {
    setPage(1);
    setSort((s) => (s.sortBy === key ? { sortBy: key, order: s.order === 'asc' ? 'desc' : 'asc' } : { sortBy: key, order: 'asc' }));
  };
  const Th = ({ k, children, num }) => (
    <th className={`sortable ${num ? 'num' : ''}`} onClick={() => toggleSort(k)} aria-sort={sort.sortBy === k ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {children}{sort.sortBy === k ? (sort.order === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <>
      <div className="page-head">
        <h1>{title}</h1>
        {user.role === 'EMPLOYEE' && <Link to="/vouchers/new" className="btn btn-primary">+ New Voucher</Link>}
      </div>

      <form className="card filters" onSubmit={apply}>
        <div className="filter-grid">
          <div className="field"><label>Search</label><input placeholder="Voucher no., employee or title" value={filters.search} onChange={set('search')} /></div>
          {!pendingOnly && (
            <div className="field"><label>Status</label>
              <select value={filters.status} onChange={set('status')}>
                <option value="">All</option>
                {meta.statuses.filter((s) => user.role === 'EMPLOYEE' || s !== 'DRAFT').map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</option>)}
              </select>
            </div>
          )}
          <div className="field"><label>Department</label>
            <select value={filters.department} onChange={set('department')}><option value="">All</option>{meta.departments.map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <div className="field"><label>Category</label>
            <select value={filters.category} onChange={set('category')}><option value="">All</option>{meta.categories.map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <div className="field"><label>Expense date from</label><input type="date" value={filters.dateFrom} onChange={set('dateFrom')} /></div>
          <div className="field"><label>Expense date to</label><input type="date" value={filters.dateTo} onChange={set('dateTo')} /></div>
          <div className="field"><label>Min amount</label><input type="number" min="0" value={filters.minAmount} onChange={set('minAmount')} /></div>
          <div className="field"><label>Max amount</label><input type="number" min="0" value={filters.maxAmount} onChange={set('maxAmount')} /></div>
        </div>
        <div className="filter-actions">
          <button className="btn btn-primary">Apply filters</button>
          <button type="button" className="btn" onClick={reset}>Reset</button>
        </div>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <Th k="voucherNumber">Voucher No.</Th>
                <Th k="expenseDate">Expense Date</Th>
                {showEmployee && <Th k="employeeName">Employee</Th>}
                <Th k="department">Department</Th>
                <th>Title</th>
                <Th k="category">Category</Th>
                <Th k="amount" num>Amount</Th>
                <Th k="status">Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !result && <tr><td colSpan="8" className="muted">Loading…</td></tr>}
              {result?.data.length === 0 && <tr><td colSpan="8" className="muted">No vouchers found.</td></tr>}
              {result?.data.map((v) => (
                <tr key={v.id}>
                  <td><Link to={`/vouchers/${v.id}`}>{v.voucherNumber}</Link></td>
                  <td>{fmtDate(v.expenseDate)}</td>
                  {showEmployee && <td>{v.employee.name}</td>}
                  <td>{v.department}</td>
                  <td>{v.title}</td>
                  <td>{v.category || '—'}</td>
                  <td className="num">{money(v.amount)}</td>
                  <td><StatusBadge status={v.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination pagination={result?.pagination} onPage={setPage} />
      </div>
    </>
  );
}
