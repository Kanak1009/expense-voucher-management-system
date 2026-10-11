import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { parseError } from '../api';

const DEMO = [
  ['Employee', 'employee1@abc.com'],
  ['Director', 'director@abc.com'],
  ['Accounts', 'accounts@abc.com'],
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.password) errs.password = 'Password is required';
    setErrors(errs);
    setServerError('');
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await login(form.email, form.password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setServerError(parseError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit} noValidate>
        <h1 className="brand brand-lg">Expense<span>Vouchers</span></h1>
        <p className="muted">Sign in to manage expense vouchers</p>
        {serverError && <div className="alert alert-error">{serverError}</div>}
        <div className={`field ${errors.email ? 'has-error' : ''}`}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          {errors.email && <div className="error-text">{errors.email}</div>}
        </div>
        <div className={`field ${errors.password ? 'has-error' : ''}`}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {errors.password && <div className="error-text">{errors.password}</div>}
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="demo-box">
          <div className="muted">Demo accounts (password <code>Password@123</code>)</div>
          {DEMO.map(([r, e]) => (
            <button type="button" key={e} className="link-btn" onClick={() => setForm({ email: e, password: 'Password@123' })}>{r}: {e}</button>
          ))}
        </div>
      </form>
    </div>
  );
}
