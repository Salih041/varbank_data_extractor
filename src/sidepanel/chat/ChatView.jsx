// "Sohbet" sekmesi: sohbet listesi, mesajlar, akışlı yanıt, veri eki ve onay akışı.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LIMITS } from '../../shared/limits.js';
import { formatTokens } from '../../shared/tokens.js';
import { errorText } from '../api.js';
import { newId, titleFrom } from '../state/conversations.js';
import { useChatStream } from '../state/useChatStream.js';
import { buildAttachment, attachmentSummary, identifierColumns } from './attachment.js';
import { buildRequestMessages } from './context.js';
import ConsentDialog from './ConsentDialog.jsx';
import SafeMarkdown from './SafeMarkdown.jsx';

const EXAMPLES = [
  'Summarize the attached variants and highlight the notable ones.',
  'Which of these variants could be pathogenic? Explain your reasoning.',
  'Explain what the columns mean.',
];

function ConversationBar({ store, disabled }) {
  const { index, current, select, startNew, remove, rename } = store;
  const [mode, setMode] = useState(null); // null | 'rename' | 'delete'
  const [title, setTitle] = useState('');
  const options = index.some((c) => c.id === current.id) ? index : [{ id: current.id, title: current.title }, ...index];

  if (mode === 'rename')
    return (
      <form
        className="conv-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) rename(current.id, title);
          setMode(null);
        }}
      >
        <input type="search" autoFocus value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} aria-label="Chat name" />
        <button type="submit" className="primary">Save</button>
        <button type="button" onClick={() => setMode(null)}>Cancel</button>
      </form>
    );

  if (mode === 'delete')
    return (
      <div className="conv-bar confirm" role="alertdialog" aria-label="Delete chat">
        <span className="spacer">Delete “{current.title}”?</span>
        <button
          type="button"
          className="danger"
          onClick={() => {
            remove(current.id);
            setMode(null);
          }}
        >
          Delete
        </button>
        <button type="button" onClick={() => setMode(null)}>Keep</button>
      </div>
    );

  return (
    <div className="conv-bar">
      <select value={current.id} disabled={disabled} onChange={(e) => select(e.target.value)} aria-label="Select chat">
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      <button type="button" className="icon" title="New chat" aria-label="New chat" disabled={disabled} onClick={startNew}>
        ＋
      </button>
      <button
        type="button"
        className="icon"
        title="Rename"
        aria-label="Rename"
        disabled={disabled || !current.messages.length}
        onClick={() => {
          setTitle(current.title);
          setMode('rename');
        }}
      >
        ✎
      </button>
      <button
        type="button"
        className="icon danger"
        title="Delete chat"
        aria-label="Delete chat"
        disabled={disabled || !current.messages.length}
        onClick={() => setMode('delete')}
      >
        🗑
      </button>
    </div>
  );
}

function RetryCountdown({ seconds, onRetry }) {
  const [left, setLeft] = useState(seconds || 0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <button type="button" disabled={left > 0} onClick={onRetry}>
      {left > 0 ? `Retry (${left}s)` : 'Retry'}
    </button>
  );
}

function Message({ msg, isLast, streaming, onCopy, onRegenerate, onEdit, onRetry }) {
  const isUser = msg.role === 'user';
  return (
    <article className={`msg ${msg.role} ${msg.status || ''}`}>
      {msg.attachments?.map((a) => (
        <div key={a.id} className="chip static" title={a.columns.join(', ')}>
          📎 {attachmentSummary(a)}
        </div>
      ))}
      {isUser ? (
        <div className="msg-text plain">{msg.content}</div>
      ) : (
        <div className="msg-text">
          {msg.content ? <SafeMarkdown text={msg.content} /> : msg.status === 'streaming' ? <span className="typing">…</span> : null}
        </div>
      )}
      {msg.status === 'error' && (
        <div className="error-card" role="alert">
          <span>{errorText(msg.error)}</span>
          {isLast && <RetryCountdown seconds={msg.retryAfter} onRetry={onRetry} />}
        </div>
      )}
      {msg.status === 'stopped' && <p className="hint">The response was interrupted.</p>}
      {msg.status !== 'streaming' && (
        <div className="msg-actions">
          {msg.content && (
            <button type="button" className="link" onClick={() => onCopy(msg.content)}>
              Copy
            </button>
          )}
          {!isUser && isLast && !streaming && msg.status !== 'error' && (
            <button type="button" className="link" onClick={onRegenerate}>
              Regenerate
            </button>
          )}
          {isUser && onEdit && !streaming && (
            <button type="button" className="link" onClick={onEdit}>
              Edit
            </button>
          )}
          {msg.usage?.total ? <span className="hint">{msg.usage.total} token</span> : null}
        </div>
      )}
    </article>
  );
}

export default function ChatView({ settings, update, store, pendingData, setPendingData, active }) {
  const { current, mutate } = store;
  const { start, stop, streaming } = useChatStream();
  const [draft, setDraft] = useState('');
  const [prebuilt, setPrebuilt] = useState(null); // düzenleme ile geri gelen hazır ek
  const [excludeIds, setExcludeIds] = useState(true);
  const [consent, setConsent] = useState(null);
  const [notice, setNotice] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);

  const contextTokens = settings.contextWindow || LIMITS.DEFAULT_CONTEXT_TOKENS;

  const idCols = useMemo(() => (pendingData ? identifierColumns(pendingData.columns) : []), [pendingData]);
  const attachment = useMemo(() => {
    if (prebuilt) return prebuilt;
    if (!pendingData) return null;
    return buildAttachment(pendingData, {
      maxChars: settings.maxAttachmentChars,
      excludeColumns: excludeIds ? idCols : [],
    });
  }, [prebuilt, pendingData, settings.maxAttachmentChars, excludeIds, idCols]);

  // Taslak + ek ile tahmini istek boyutu.
  const estimate = useMemo(() => {
    if (!current) return null;
    const probe = [
      ...current.messages,
      { role: 'user', content: draft || ' ', attachments: attachment ? [{ ...attachment, id: '__probe' }] : [] },
    ];
    return buildRequestMessages(probe, { contextTokens, responseTokens: LIMITS.DEFAULT_MAX_COMPLETION_TOKENS });
  }, [current, draft, attachment, contextTokens]);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [current?.messages]);

  const flash = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 2500);
  };

  const runCompletion = useCallback(
    (messages) => {
      const assistantId = newId();
      const built = buildRequestMessages(messages, { contextTokens, responseTokens: LIMITS.DEFAULT_MAX_COMPLETION_TOKENS });
      const placeholder = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: built.ok ? 'streaming' : 'error',
        error: built.ok ? undefined : built.error,
        createdAt: Date.now(),
        droppedCount: built.ok ? built.droppedCount : 0,
      };
      mutate((c) => ({ ...c, messages: [...messages, placeholder] }), !built.ok);
      if (!built.ok) return;

      const patch = (p, persist) =>
        mutate((c) => ({ ...c, messages: c.messages.map((m) => (m.id === assistantId ? { ...m, ...p } : m)) }), persist);

      start({
        model: settings.model,
        messages: built.messages,
        temperature: settings.temperature,
        maxTokens: LIMITS.DEFAULT_MAX_COMPLETION_TOKENS,
        onText: (text) => patch({ content: text }, false),
        onDone: ({ usage, finishReason }) => patch({ status: 'done', usage, finishReason }, true),
        onError: (code, retryAfter, partial) =>
          patch(
            code === 'ABORTED'
              ? { status: 'stopped', content: partial }
              : partial && code === 'DISCONNECTED'
                ? { status: 'stopped', content: partial }
                : { status: 'error', error: code, retryAfter, content: partial },
            true,
          ),
      });
    },
    [contextTokens, mutate, settings.model, settings.temperature, start],
  );

  function doSend(text, att) {
    const userMsg = {
      id: newId(),
      role: 'user',
      content: text,
      attachments: att ? [{ ...att, id: newId() }] : [],
      createdAt: Date.now(),
    };
    const isFirst = current.messages.length === 0;
    const messages = [...current.messages, userMsg];
    if (isFirst) mutate((c) => ({ ...c, title: titleFrom(text) }), false);
    setDraft('');
    setPrebuilt(null);
    if (att) setPendingData(null);
    stickToBottom.current = true;
    runCompletion(messages);
  }

  function send() {
    const text = draft.trim();
    if (!text || streaming || !current) return;
    if (text.length > LIMITS.MAX_USER_MESSAGE_CHARS) {
      flash(`A message can be at most ${LIMITS.MAX_USER_MESSAGE_CHARS} characters.`);
      return;
    }
    if (attachment && (!settings.allowAiData || (settings.askEveryTime && !current.consentRemembered))) {
      setConsent({ text });
      return;
    }
    doSend(text, attachment);
  }

  async function confirmConsent(remember) {
    if (!settings.allowAiData) await update({ allowAiData: true });
    if (remember) mutate((c) => ({ ...c, consentRemembered: true }), false);
    const { text } = consent;
    setConsent(null);
    doSend(text, attachment);
  }

  function regenerate() {
    const msgs = current.messages;
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
    if (lastUser < 0) return;
    runCompletion(msgs.slice(0, lastUser + 1));
  }

  function editLast() {
    const msgs = current.messages;
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
    const m = msgs[lastUser];
    setDraft(m.content);
    if (m.attachments?.length) setPrebuilt(m.attachments[m.attachments.length - 1]);
    mutate((c) => ({ ...c, messages: msgs.slice(0, lastUser) }));
    inputRef.current?.focus();
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape' && streaming) stop();
  };

  if (!current) return <p className="empty">Loading…</p>;

  const msgs = current.messages;
  const lastUserIdx = msgs.map((m) => m.role).lastIndexOf('user');
  const dropped = msgs.at(-1)?.droppedCount;
  const overBudget = estimate && !estimate.ok && estimate.error === 'TOO_LARGE';

  return (
    <div className="chat-view">
      <ConversationBar store={store} disabled={streaming} />

      <div
        className="messages"
        ref={listRef}
        aria-live="polite"
        aria-busy={streaming}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {msgs.length === 0 ? (
          <div className="empty">
            <p>Ask questions about your Varbank data. You can attach data from the Tables tab.</p>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="example" onClick={() => setDraft(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) => (
            <Message
              key={m.id}
              msg={m}
              isLast={i === msgs.length - 1}
              streaming={streaming}
              onCopy={(t) => navigator.clipboard.writeText(t).then(() => flash('Copied.'), () => flash('Could not copy.'))}
              onRegenerate={regenerate}
              onRetry={regenerate}
              onEdit={i === lastUserIdx ? editLast : null}
            />
          ))
        )}
        {dropped > 0 && <p className="hint center">The oldest {dropped} message(s) were not sent to the model due to the context limit.</p>}
      </div>

      {notice && <p className="notice ok" role="status">{notice}</p>}

      <div className="composer">
        {attachment && (
          <div className={`chip ${attachment.includedRows < attachment.rowCount ? 'warn' : ''}`}>
            <span title={attachment.columns.join(', ')}>
              📎 {attachmentSummary(attachment)} · ~{formatTokens(attachment.tokens)} token
            </span>
            <button
              type="button"
              className="icon"
              aria-label="Remove attachment"
              onClick={() => {
                setPrebuilt(null);
                setPendingData(null);
              }}
            >
              ✕
            </button>
          </div>
        )}
        {attachment && attachment.includedRows < attachment.rowCount && (
          <p className="hint warn">
            Due to the data limit ({settings.maxAttachmentChars.toLocaleString('en-US')} characters) only the first {attachment.includedRows}{' '}
            rows will be sent. Select fewer columns or raise the limit in Settings.
          </p>
        )}
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder={attachment ? 'Ask a question about the attached data…' : 'Type a message… (Enter to send, Shift+Enter for a new line)'}
          onChange={(e) => {
            setDraft(e.target.value);
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 160) + 'px';
          }}
          onKeyDown={onKeyDown}
          maxLength={LIMITS.MAX_USER_MESSAGE_CHARS}
          aria-label="Message"
        />
        <div className="row-actions">
          <span className={`hint ${overBudget ? 'error' : ''}`}>
            {estimate && `~${formatTokens(estimate.estimatedTokens)} / ${formatTokens(contextTokens - LIMITS.DEFAULT_MAX_COMPLETION_TOKENS)} token`}
            {overBudget && ' — exceeds the context limit'}
          </span>
          <span className="spacer" />
          <span className="hint">{settings.model}</span>
          {streaming ? (
            <button type="button" onClick={stop}>
              ■ Stop
            </button>
          ) : (
            <button type="button" className="primary" disabled={!draft.trim() || overBudget} onClick={send}>
              Send
            </button>
          )}
        </div>
      </div>

      {consent && attachment && (
        <ConsentDialog
          attachment={attachment}
          identifierCols={prebuilt ? [] : idCols}
          excludeIds={excludeIds}
          setExcludeIds={setExcludeIds}
          needsEnable={!settings.allowAiData}
          onConfirm={confirmConsent}
          onCancel={() => setConsent(null)}
        />
      )}
    </div>
  );
}
