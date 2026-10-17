// Tablo verisi dış servise gitmeden önce kullanıcıya TAM olarak ne gönderileceğini gösterir.
// Kullanıcı açıkça onaylamadan hiçbir tablo verisi gönderilmez.

import { useEffect, useRef, useState } from 'react';
import { formatTokens } from '../../shared/tokens.js';

const PREVIEW_CHARS = 6000;

export default function ConsentDialog({ attachment, identifierCols, excludeIds, setExcludeIds, needsEnable, onConfirm, onCancel }) {
  const [remember, setRemember] = useState(false);
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const a = attachment;
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <h2 id="consent-title">Send table data?</h2>
        <p>
          The data below will be sent with your message to <strong>api.groq.com</strong> (Groq, USA). Varbank data comes from a
          login-protected system and may contain patient/sample health data.
        </p>
        <ul className="facts">
          <li>Table: {a.caption}{a.tab ? ` (${a.tab})` : ''}</li>
          <li>
            Rows: {a.includedRows}
            {a.includedRows < a.rowCount ? ` / ${a.rowCount} (truncated due to the size limit)` : ''}
          </li>
          <li>Columns: {a.columns.length}</li>
          <li>
            Size: {a.charCount.toLocaleString('en-US')} characters (~{formatTokens(a.tokens)} token)
          </li>
        </ul>
        {identifierCols.length > 0 && (
          <label className="check warn">
            <input type="checkbox" checked={excludeIds} onChange={(e) => setExcludeIds(e.target.checked)} />
            Do not send potentially identifying columns: {identifierCols.join(', ')}
          </label>
        )}
        <details>
          <summary>Show the full text to be sent</summary>
          <pre className="payload">
            {a.text.slice(0, PREVIEW_CHARS)}
            {a.text.length > PREVIEW_CHARS ? `\n… (+${(a.text.length - PREVIEW_CHARS).toLocaleString('en-US')} characters)` : ''}
          </pre>
        </details>
        {needsEnable && (
          <p className="hint">Confirming turns on “Allow sending table data to the AI service” in Settings.</p>
        )}
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Don't ask again in this chat
        </label>
        <div className="row-actions end">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" ref={confirmRef} onClick={() => onConfirm(remember)}>
            Confirm and send
          </button>
        </div>
      </div>
    </div>
  );
}
