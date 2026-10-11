import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = {
  EMPLOYEE: [['/', 'Dashboard'], ['/vouchers/new', 'Create Voucher'], ['/vouchers', 'My Vouchers']],
  DIRECTOR: [['/', 'Dashboard'], ['/pending', 'Pending Approvals'], ['/vouchers', 'All Vouchers']],
  ACCOUNTS: [['/', 'Dashboard'], ['/vouchers', 'All Vouchers']],
};
const ROLE_LABEL = { EMPLOYEE: 'Employee', DIRECTOR: 'Director', ACCOUNTS: 'Accounts Team' };

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <div className="brand">Expense<span>Vouchers</span></div>
        <nav>
          {NAV[user.role].map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/' || to === '/vouchers'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="user-name">{user.name}</div>
          <div className="user-role">{ROLE_LABEL[user.role]}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
