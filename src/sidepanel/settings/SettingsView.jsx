import { useEffect, useState } from 'react';
import { MSG } from '../../shared/messages.js';
import { LIMITS } from '../../shared/limits.js';
import { formatTokens, estimateTokens } from '../../shared/tokens.js';
import { DEFAULT_SETTINGS } from '../../shared/config.js';
import { errorText, sendToBackground } from '../api.js';
import { TextSizePicker } from './TextSize.jsx';

function ApiKeyForm() {
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
    const res = await sendToBackground({ type: MSG.SET_API_KEY, key, storage });
    setBusy(false);
    setKey(''); // anahtar bellekte/arayüzde tutulmaz
    if (res.ok) {
      setStatus(res);
      setMsg({ kind: 'ok', text: 'Key verified and saved.' });
    } else setMsg({ kind: 'error', text: res.error === 'BAD_REQUEST' ? 'Invalid key format.' : errorText(res.error) });
  }

  async function clear() {
    const res = await sendToBackground({ type: MSG.CLEAR_API_KEY });
    if (res.ok) setStatus(res);
    setMsg({ kind: 'ok', text: 'Key removed.' });
  }

  return (
    <fieldset className="box">
      <legend>Groq API key</legend>
      {status?.hasKey ? (
        <p>
          Saved: <code>••••{status.last4}</code> ({status.storage === 'session' ? 'this browser session only' : 'on this device'}){' '}
          <button type="button" className="link danger" onClick={clear}>
            Remove
          </button>
        </p>
      ) : (
        <p className="hint">No key set. The key is stored only on this device and never in code or sync.</p>
      )}
      <form onSubmit={save} className="stack">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="gsk_…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label="Groq API key"
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
        <button type="submit" className="primary" disabled={busy || key.trim().length < 20}>
          {busy ? 'Verifying…' : 'Verify and save'}
        </button>
      </form>
      {msg && <p className={`notice ${msg.kind}`}>{msg.text}</p>}
    </fieldset>
  );
}

function ModelSelect({ settings, update }) {
  const [models, setModels] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    const res = await sendToBackground({ type: MSG.LIST_MODELS });
    if (res.ok) {
      setModels(res.models);
      const cur = res.models.find((m) => m.id === settings.model);
      if (cur) update({ contextWindow: cur.contextWindow });
      else if (res.models[0]) update({ model: res.models[0].id, contextWindow: res.models[0].contextWindow });
    } else setErr(errorText(res.error));
  }

  return (
    <fieldset className="box">
      <legend>Model</legend>
      <div className="row-actions model-row">
        {models ? (
          <select
            value={settings.model}
            onChange={(e) => {
              const m = models.find((x) => x.id === e.target.value);
              update({ model: m.id, contextWindow: m.contextWindow });
            }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
                {m.contextWindow ? ` (${formatTokens(m.contextWindow)} context)` : ''}
              </option>
            ))}
          </select>
        ) : (
          <code className="ellipsis" title={settings.model}>
            {settings.model}
          </code>
        )}
        <button type="button" onClick={load}>
          Load models
        </button>
      </div>
      {err && <p className="notice error">{err}</p>}
      <label className="field">
        <span className="field-label value-label">
          <span>Temperature</span>
          <span className="value">{settings.temperature.toFixed(1)}</span>
        </span>
        <input
          type="range"
          min="0"
          max="1.5"
          step="0.1"
          value={settings.temperature}
          onChange={(e) => update({ temperature: Number(e.target.value) })}
        />
      </label>
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
        Allow sending table data to the AI service (api.groq.com)
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
      <ApiKeyForm />
      <ModelSelect settings={settings} update={update} />
      <PrivacySettings settings={settings} update={update} onClearHistory={onClearHistory} />
      <p className="hint">
        Varbank data may contain patient/sample health data. Check your institution's data protection rules before
        sending data to AI.
      </p>
    </div>
  );
}
