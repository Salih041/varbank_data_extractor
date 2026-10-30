import { useEffect, useState } from 'react';
import { MSG } from '../../shared/messages.js';
import { LIMITS } from '../../shared/limits.js';
import { formatTokens, estimateTokens } from '../../shared/tokens.js';
import { DEFAULT_SETTINGS } from '../../shared/config.js';
import { errorText, sendToBackground } from '../api.js';
import { TextSizePicker } from './TextSize.jsx';

// AI sohbeti davetle açılır: sunucu yalnızca bu anahtarı bilenlerin isteklerini kabul eder.
const MIN_ACCESS_KEY_CHARS = 12;

function AccessKeyForm() {
  const [status, setStatus] = useState(null);
  const [key, setKey] = useState('');
  const [storage, setStorage] = useState('local');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    sendToBackground({ type: MSG.GET_KEY_STATUS }).then(setStatus);
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await sendToBackground({ type: MSG.SET_ACCESS_KEY, key, storage });
    setBusy(false);
    setKey(''); // anahtar bellekte/arayüzde tutulmaz
    if (res.ok) {
      setStatus(res);
      setMsg({ kind: 'ok', text: 'Access key verified and saved.' });
    } else setMsg({ kind: 'error', text: errorText(res.error) });
  }

  async function clear() {
    const res = await sendToBackground({ type: MSG.CLEAR_ACCESS_KEY });
    if (res.ok) setStatus(res);
    setMsg({ kind: 'ok', text: 'Access key removed.' });
  }

  return (
    <fieldset className="box">
      <legend>AI access key</legend>
      {status?.hasKey ? (
        <p>
          Saved: <code>••••{status.last4}</code> ({status.storage === 'session' ? 'this browser session only' : 'on this device'}){' '}
          <button type="button" className="link danger" onClick={clear}>
            Remove
          </button>
        </p>
      ) : (
        <p className="hint">
          The AI chat is available by invitation. Enter the access key you were given. Table extraction works without
          it.
        </p>
      )}
      <form onSubmit={save} className="stack">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Access key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label="Access key"
        />
        <div className="radio-row options">
          <label>
            <input type="radio" checked={storage === 'local'} onChange={() => setStorage('local')} />
            Store on this device
          </label>
          <label>
            <input type="radio" checked={storage === 'session'} onChange={() => setStorage('session')} />
            Delete when browser closes
          </label>
        </div>
        <button type="submit" className="primary" disabled={busy || key.trim().length < MIN_ACCESS_KEY_CHARS}>
          {busy ? 'Verifying…' : 'Verify and save'}
        </button>
      </form>
      {msg && <p className={`notice ${msg.kind}`}>{msg.text}</p>}
    </fieldset>
  );
}

function PrivacySettings({ settings, update, onClearHistory }) {
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <fieldset className="box">
      <legend>Privacy and data limits</legend>
      <label className="check">
        <input type="checkbox" checked={settings.allowAiData} onChange={(e) => update({ allowAiData: e.target.checked })} />
        Allow sending table data to the AI assistant (our server, Groq and Tavily web search)
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.askEveryTime}
          disabled={!settings.allowAiData}
          onChange={(e) => update({ askEveryTime: e.target.checked })}
        />
        Ask for confirmation before every data send
      </label>
      <label className="field">
        <span className="field-label value-label">
          <span>Max data sent to AI</span>
          <span className="value">
            {settings.maxAttachmentChars.toLocaleString('en-US')} chars · ~
            {formatTokens(estimateTokens('x'.repeat(settings.maxAttachmentChars)))} tokens
          </span>
        </span>
        <input
          type="range"
          min={LIMITS.MIN_MAX_ATTACHMENT_CHARS}
          max={LIMITS.HARD_MAX_ATTACHMENT_CHARS}
          step="1000"
          value={settings.maxAttachmentChars}
          onChange={(e) => update({ maxAttachmentChars: Number(e.target.value) })}
        />
      </label>
      {settings.maxAttachmentChars > LIMITS.DEFAULT_MAX_ATTACHMENT_CHARS && (
        <p className="hint warn">
          The AI service currently allows about {LIMITS.DEFAULT_MAX_ATTACHMENT_CHARS.toLocaleString('en-US')} characters
          of table data per message. Larger data may be rejected as too large.
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={settings.saveHistory} onChange={(e) => update({ saveHistory: e.target.checked })} />
        Save chat history on this device
      </label>
      {confirmClear ? (
        <div className="row-actions" role="alertdialog" aria-label="Delete history">
          <span>Permanently delete all chats?</span>
          <button
            type="button"
            className="danger"
            onClick={() => {
              onClearHistory();
              setConfirmClear(false);
            }}
          >
            Yes, delete
          </button>
          <button type="button" onClick={() => setConfirmClear(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="danger" onClick={() => setConfirmClear(true)}>
          Delete all chat history
        </button>
      )}
    </fieldset>
  );
}

function AppearanceSettings({ settings, update }) {
  return (
    <fieldset className="box">
      <legend>Appearance</legend>
      <div className="row-actions">
        <span className="field-label spacer">Text size</span>
        {settings.textSize !== DEFAULT_SETTINGS.textSize && (
          <button type="button" className="link" onClick={() => update({ textSize: DEFAULT_SETTINGS.textSize })}>
            Reset to default
          </button>
        )}
      </div>
      <TextSizePicker value={settings.textSize} onChange={(textSize) => update({ textSize })} />
      <p className="hint">Also available from the A− / A+ buttons at the top of the panel.</p>
    </fieldset>
  );
}

export default function SettingsView({ settings, update, onClearHistory }) {
  return (
    <div className="settings-view">
      <AppearanceSettings settings={settings} update={update} />
      <AccessKeyForm />
      <PrivacySettings settings={settings} update={update} onClearHistory={onClearHistory} />
      <p className="hint">
        Varbank data may contain patient/sample health data. Check your institution's data protection rules before
        sending data to AI.
      </p>
    </div>
  );
}
