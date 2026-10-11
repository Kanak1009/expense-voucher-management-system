import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { parseError } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { fmtDateTime, money } from '../utils';

const CARDS = {
  EMPLOYEE: [
    ['totalVouchers', 'Total Vouchers'], ['draftVouchers', 'Draft Vouchers', 'muted'], ['pendingApproval', 'Pending Approval', 'warn'],
    ['approvedVouchers', 'Approved Vouchers', 'ok'], ['rejectedVouchers', 'Rejected Vouchers', 'bad'], ['totalAmountClaimed', 'Total Amount Claimed', 'money'],
  ],
  DIRECTOR: [
    ['pendingApprovalCount', 'Pending Approval', 'warn'], ['approvedToday', 'Approved Today', 'ok'],
    ['rejectedToday', 'Rejected Today', 'bad'], ['totalPendingAmount', 'Total Pending Amount', 'money'],
  ],
  ACCOUNTS: [
    ['totalVouchers', 'Total Vouchers'], ['pendingApproval', 'Pending Approval', 'warn'], ['approvedVouchers', 'Approved Vouchers', 'ok'],
    ['rejectedVouchers', 'Rejected Vouchers', 'bad'], ['totalApprovedAmount', 'Total Approved Expense Amount', 'money'],
  ],
};
const RECENT_TITLE = { EMPLOYEE: 'Recently updated vouchers', DIRECTOR: 'Recent voucher activity', ACCOUNTS: 'Recent approved vouchers' };
const isMoney = (key) => /amount/i.test(key);

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then((r) => setData(r.data)).catch((e) => setError(parseError(e).message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="muted">Loading dashboard…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome, {user.name}</h1>
          <p className="muted">Here is an overview of your vouchers.</p>
        </div>
        {user.role === 'EMPLOYEE' && <Link to="/vouchers/new" className="btn btn-primary">+ New Voucher</Link>}
        {user.role === 'DIRECTOR' && <Link to="/pending" className="btn btn-primary">Review Pending</Link>}
      </div>

      <div className="stat-grid">
        {CARDS[user.role].map(([key, label, tone]) => (
          <StatCard key={key} label={label} tone={tone} value={isMoney(key) ? money(data.stats[key]) : data.stats[key]} />
        ))}
      </div>

      <div className="card">
        <h2>{RECENT_TITLE[user.role]}</h2>
        {data.recent.length === 0 ? <p className="muted">Nothing here yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Voucher</th><th>Title</th>{user.role !== 'EMPLOYEE' && <th>Employee</th>}<th className="num">Amount</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {data.recent.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td><Link to={`/vouchers/${r.id}`}>{r.voucherNumber}</Link></td>
                    <td>{r.title}</td>
                    {user.role !== 'EMPLOYEE' && <td>{r.employeeName}</td>}
                    <td className="num">{money(r.amount)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{fmtDateTime(r.activityAt || r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
