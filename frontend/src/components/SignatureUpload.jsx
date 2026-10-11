import { useEffect, useState } from 'react';
import { assetUrl } from '../api';

const MAX_MB = 2;

// Image picker with preview. `existingUrl` = signature already stored on the server.
export default function SignatureUpload({ label, file, onChange, existingUrl, error, hint }) {
  const [preview, setPreview] = useState(null);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    setLocalError('');
    if (!f) return;
    if (!['image/png', 'image/jpeg'].includes(f.type)) { setLocalError('Only PNG or JPEG images are allowed'); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setLocalError(`Image must be smaller than ${MAX_MB} MB`); return; }
    onChange(f);
  };

  const shown = preview || assetUrl(existingUrl);

  return (
    <div className={`field ${error || localError ? 'has-error' : ''}`}>
      <label>{label}</label>
      <div className="signature-box">
        {shown ? <img src={shown} alt="Signature preview" /> : <span className="muted">No signature selected</span>}
      </div>
      <input type="file" accept="image/png,image/jpeg" onChange={pick} />
      {hint && <div className="hint">{hint}</div>}
      {(error || localError) && <div className="error-text">{error || localError}</div>}
    </div>
  );
}
