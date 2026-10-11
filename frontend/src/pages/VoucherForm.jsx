import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { parseError } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import SignatureUpload from '../components/SignatureUpload.jsx';
import { todayStr } from '../utils';

// Defined at module level so inputs keep focus between renders
const Field = ({ name, label, error, children }) => (
  <div className={`field ${error ? 'has-error' : ''}`}>
    <label htmlFor={name}>{label}</label>
    {children}
    {error && <div className="error-text">{error}</div>}
  </div>
);

const BLANK = { department: '', title: '', category: '', expenseDate: '', amount: '', description: '' };

// Create / edit a Draft voucher. "Save Draft" and "Submit for Approval" share the same validation.
export default function VoucherForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { user, refreshUser } = useAuth();

  const [form, setForm] = useState(BLANK);
  const [meta, setMeta] = useState({ categories: [], departments: [] });
  const [signatureFile, setSignatureFile] = useState(null);
  const [existingSig, setExistingSig] = useState(null);
  const [remember, setRemember] = useState(false);
  const [voucherNumber, setVoucherNumber] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);

  useEffect(() => { api.get('/meta').then((r) => setMeta(r.data)); }, []);

  useEffect(() => {
    if (!editing) return;
    api.get(`/vouchers/${id}`)
      .then(({ data }) => {
        const v = data.voucher;
        if (v.status !== 'DRAFT') { toast('Only Draft vouchers can be edited', 'error'); navigate(`/vouchers/${id}`, { replace: true }); return; }
        setForm({ department: v.department, title: v.title, category: v.category || '', expenseDate: v.expenseDate, amount: String(v.amount), description: v.description || '' });
        setExistingSig(v.employee.signatureUrl);
        setVoucherNumber(v.voucherNumber);
      })
      .catch((e) => { setServerError(parseError(e).message); })
      .finally(() => setLoading(false));
  }, [editing, id, navigate, toast]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const hasSignature = Boolean(signatureFile || existingSig || user.signatureUrl);

  const validate = (forSubmit) => {
    const e = {};
    if (!form.department) e.department = 'Department is required';
    if (!form.title.trim()) e.title = 'Expense title is required';
    if (!form.expenseDate) e.expenseDate = 'Expense date is required';
    else if (form.expenseDate > todayStr()) e.expenseDate = 'Expense date cannot be in the future';
    if (form.amount === '') e.amount = 'Amount is required';
    else if (!(Number(form.amount) > 0)) e.amount = 'Amount must be greater than zero';
    else if (!/^\d+(\.\d{1,2})?$/.test(form.amount)) e.amount = 'Use at most 2 decimal places';
    if (forSubmit && !hasSignature) e.signature = 'Employee signature is required before submission';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async (submit) => {
    setServerError('');
    if (!validate(submit)) return;
    setBusy(true);
    try {
      const payload = { ...form, amount: Number(form.amount), category: form.category || null, description: form.description || null };
      const { data } = editing ? await api.put(`/vouchers/${id}`, payload) : await api.post('/vouchers', payload);
      const voucherId = data.voucher.id;

      if (signatureFile) {
        const fd = new FormData();
        fd.append('signature', signatureFile);
        await api.post(`/vouchers/${voucherId}/signature`, fd);
        if (remember) { await api.post('/users/me/signature', fd); await refreshUser(); }
      }
      if (submit) {
        await api.post(`/vouchers/${voucherId}/submit`);
        toast('Voucher submitted for approval');
      } else {
        toast('Draft saved');
      }
      navigate(`/vouchers/${voucherId}`);
    } catch (err) {
      const { message, fieldErrors } = parseError(err);
      setServerError(message);
      if (fieldErrors && Object.keys(fieldErrors).length) setErrors((prev) => ({ ...prev, ...fieldErrors }));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="muted">Loading…</div>;

  return (
    <>
      <div className="page-head">
        <h1>{editing ? `Edit Draft ${voucherNumber}` : 'Create Voucher'}</h1>
      </div>
      <form className="card form-grid" onSubmit={(e) => e.preventDefault()} noValidate>
        {serverError && <div className="alert alert-error span-2">{serverError}</div>}

        <Field name="department" error={errors.department} label="Department *">
          <select id="department" value={form.department} onChange={set('department')}>
            <option value="">Select department</option>
            {meta.departments.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field name="category" error={errors.category} label="Expense Category">
          <select id="category" value={form.category} onChange={set('category')}>
            <option value="">Select category</option>
            {meta.categories.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field name="title" error={errors.title} label="Expense Title *">
          <input id="title" maxLength={200} value={form.title} onChange={set('title')} placeholder="e.g. Client visit – cab fare" />
        </Field>
        <Field name="expenseDate" error={errors.expenseDate} label="Expense Date *">
          <input id="expenseDate" type="date" max={todayStr()} value={form.expenseDate} onChange={set('expenseDate')} />
        </Field>
        <Field name="amount" error={errors.amount} label="Amount (₹) *">
          <input id="amount" type="number" step="0.01" min="0" value={form.amount} onChange={set('amount')} placeholder="0.00" />
        </Field>
        <div className="field">
          <label>Employee</label>
          <input disabled value={`${user.name}${user.employeeCode ? ` (${user.employeeCode})` : ''}`} />
        </div>
        <div className="span-2">
          <Field name="description" error={errors.description} label="Expense Description">
            <textarea id="description" rows={4} maxLength={2000} value={form.description} onChange={set('description')} />
          </Field>
        </div>

        <div className="span-2">
          <SignatureUpload
            label="Employee Signature * (required to submit)"
            file={signatureFile}
            onChange={setSignatureFile}
            existingUrl={existingSig || user.signatureUrl}
            error={errors.signature}
            hint={!signatureFile && !existingSig && user.signatureUrl ? 'Using the signature saved on your profile. Upload a new image to override.' : 'PNG or JPEG, max 2 MB.'}
          />
          {signatureFile && (
            <label className="checkbox"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Save this as my default signature</label>
          )}
        </div>

        <div className="form-actions span-2">
          <button type="button" className="btn" disabled={busy} onClick={() => navigate(-1)}>Cancel</button>
          <button type="button" className="btn" disabled={busy} onClick={() => save(false)}>Save as Draft</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save(true)}>{busy ? 'Working…' : 'Submit for Approval'}</button>
        </div>
      </form>
    </>
  );
}
