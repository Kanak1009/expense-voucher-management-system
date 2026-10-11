import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { assetUrl, parseError } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import StatusBadge, { statusLabel } from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import SignatureUpload from '../components/SignatureUpload.jsx';
import { fmtDate, fmtDateTime, money } from '../utils';

const Row = ({ label, children }) => (
  <div className="detail-row"><div className="detail-label">{label}</div><div className="detail-value">{children || '—'}</div></div>
);

export default function VoucherDetail() {
  const { id } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'approve' | 'reject' | 'delete'
  const [busy, setBusy] = useState(false);
  const [sigFile, setSigFile] = useState(null);
  const [sigError, setSigError] = useState('');
  const [remember, setRemember] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const load = useCallback(() => {
    api.get(`/vouchers/${id}`).then((r) => setData(r.data)).catch((e) => setError(parseError(e).message));
  }, [id]);
  useEffect(load, [load]);

  const closeModal = () => { setModal(null); setSigFile(null); setSigError(''); setReason(''); setReasonError(''); setRemember(false); };

  const act = async (fn, successMsg) => {
    setBusy(true);
    try { await fn(); toast(successMsg); closeModal(); load(); } catch (e) { toast(parseError(e).message, 'error'); } finally { setBusy(false); }
  };

  const submitVoucher = () => {
    if (!v.employee.signatureUrl && !user.signatureUrl) { toast('Employee signature is mandatory before submission — edit the draft to add one', 'error'); return; }
    act(() => api.post(`/vouchers/${id}/submit`), 'Voucher submitted for approval');
  };

  const approve = () => {
    if (!sigFile && !user.signatureUrl) { setSigError('Director signature is required to approve'); return; }
    act(async () => {
      const fd = new FormData();
      if (sigFile) fd.append('signature', sigFile);
      await api.post(`/vouchers/${id}/approve`, fd);
      if (sigFile && remember) { const fd2 = new FormData(); fd2.append('signature', sigFile); await api.post('/users/me/signature', fd2); await refreshUser(); }
    }, 'Voucher approved');
  };

  const reject = () => {
    if (reason.trim().length < 3) { setReasonError('Rejection reason is required'); return; }
    act(() => api.post(`/vouchers/${id}/reject`, { reason }), 'Voucher rejected');
  };

  const remove = () => act(async () => { await api.delete(`/vouchers/${id}`); navigate('/vouchers'); }, 'Draft deleted');

  if (error) return <div className="alert alert-error">{error} <Link to="/vouchers">Back to list</Link></div>;
  if (!data) return <div className="muted">Loading…</div>;

  const v = data.voucher;
  const isOwnerDraft = user.role === 'EMPLOYEE' && v.status === 'DRAFT';
  const canReview = user.role === 'DIRECTOR' && v.status === 'PENDING_APPROVAL';

  return (
    <>
      <div className="page-head no-print">
        <div>
          <Link to="/vouchers" className="muted">← Back to vouchers</Link>
          <h1>{v.voucherNumber} <StatusBadge status={v.status} /></h1>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => window.print()}>Print / Save PDF</button>
          {isOwnerDraft && (<>
            <Link className="btn" to={`/vouchers/${v.id}/edit`}>Edit</Link>
            <button className="btn btn-danger" onClick={() => setModal('delete')}>Delete</button>
            <button className="btn btn-primary" disabled={busy} onClick={submitVoucher}>Submit for Approval</button>
          </>)}
          {canReview && (<>
            <button className="btn btn-danger" onClick={() => setModal('reject')}>Reject</button>
            <button className="btn btn-success" onClick={() => setModal('approve')}>Approve</button>
          </>)}
        </div>
      </div>

      {v.status === 'REJECTED' && (
        <div className="alert alert-error"><strong>Rejected{v.director ? ` by ${v.director.name}` : ''}:</strong> {v.rejectionReason}</div>
      )}

      <div className="card voucher-sheet">
        <div className="sheet-title">
          <h2>EXPENSE VOUCHER</h2>
          <div className="sheet-number">{v.voucherNumber}</div>
        </div>

        <div className="detail-grid">
          <Row label="Voucher Date">{fmtDate(v.voucherDate)}</Row>
          <Row label="Expense Date">{fmtDate(v.expenseDate)}</Row>
          <Row label="Department">{v.department}</Row>
          <Row label="Expense Category">{v.category}</Row>
          <Row label="Expense Title">{v.title}</Row>
          <Row label="Amount"><strong>{money(v.amount)}</strong></Row>
          <Row label="Employee Name">{v.employee.name}</Row>
          <Row label="Employee ID">{v.employee.employeeCode}</Row>
          <Row label="Current Status"><StatusBadge status={v.status} /></Row>
          <Row label="Approval Date">{fmtDateTime(v.approvalDate)}</Row>
          <Row label="Created">{fmtDateTime(v.createdAt)}</Row>
          <Row label="Last Updated">{fmtDateTime(v.updatedAt)}</Row>
        </div>
        <div className="detail-desc"><div className="detail-label">Expense Description</div><p>{v.description || '—'}</p></div>

        <div className="signatures">
          <div className="signature-block">
            <div className="signature-img">{v.employee.signatureUrl ? <img src={assetUrl(v.employee.signatureUrl)} alt="Employee signature" /> : <span className="muted">Not signed</span>}</div>
            <div className="signature-caption">Employee Signature<br /><small>{v.employee.name}</small></div>
          </div>
          <div className="signature-block">
            <div className="signature-img">{v.director?.signatureUrl ? <img src={assetUrl(v.director.signatureUrl)} alt="Director signature" /> : <span className="muted">{v.status === 'APPROVED' ? '' : 'Pending'}</span>}</div>
            <div className="signature-caption">Director Signature<br /><small>{v.status === 'APPROVED' ? v.director?.name : '—'}</small></div>
          </div>
        </div>
      </div>

      <div className="card no-print">
        <h2>Status history</h2>
        <ul className="timeline">
          {data.history.map((h, i) => (
            <li key={i}>
              <strong>{statusLabel(h.toStatus)}</strong> <span className="muted">by {h.changedBy} · {fmtDateTime(h.changedAt)}</span>
              {h.toStatus === 'REJECTED' && h.remarks && <div className="muted">Reason: {h.remarks}</div>}
            </li>
          ))}
        </ul>
      </div>

      {modal === 'approve' && (
        <Modal title="Approve voucher" onClose={closeModal}>
          <p className="muted">Your signature is required to approve {v.voucherNumber} ({money(v.amount)}).</p>
          <SignatureUpload label="Director Signature *" file={sigFile} onChange={(f) => { setSigFile(f); setSigError(''); }} existingUrl={user.signatureUrl} error={sigError}
            hint={!sigFile && user.signatureUrl ? 'Your saved signature will be used unless you upload a new one.' : 'PNG or JPEG, max 2 MB.'} />
          {sigFile && <label className="checkbox"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Save as my default signature</label>}
          <div className="form-actions"><button className="btn" onClick={closeModal}>Cancel</button><button className="btn btn-success" disabled={busy} onClick={approve}>{busy ? 'Approving…' : 'Confirm approval'}</button></div>
        </Modal>
      )}
      {modal === 'reject' && (
        <Modal title="Reject voucher" onClose={closeModal}>
          <div className={`field ${reasonError ? 'has-error' : ''}`}>
            <label htmlFor="reason">Rejection reason *</label>
            <textarea id="reason" rows={4} value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(''); }} />
            {reasonError && <div className="error-text">{reasonError}</div>}
          </div>
          <div className="form-actions"><button className="btn" onClick={closeModal}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={reject}>{busy ? 'Rejecting…' : 'Confirm rejection'}</button></div>
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title="Delete draft?" onClose={closeModal}>
          <p>This permanently deletes {v.voucherNumber}. This cannot be undone.</p>
          <div className="form-actions"><button className="btn" onClick={closeModal}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={remove}>Delete</button></div>
        </Modal>
      )}
    </>
  );
}
