// "Sohbet" sekmesi: sohbet listesi, mesajlar, agent'ın adımları (arama, kaynaklar, soru),
// veri eki ve onay akışı. Konuşmanın geçmişi sunucuda tutulur; her turda yalnızca yeni mesaj gider.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LIMITS } from '../../shared/limits.js';
import { MSG } from '../../shared/messages.js';
import { formatTokens } from '../../shared/tokens.js';
import { errorText, sendToBackground } from '../api.js';
import { newId, titleFrom } from '../state/conversations.js';
import { useChatStream } from '../state/useChatStream.js';
import { buildAttachment, attachmentSummary, identifierColumns } from './attachment.js';
import ConsentDialog from './ConsentDialog.jsx';
import SafeMarkdown, { safeUrl } from './SafeMarkdown.jsx';

const EXAMPLES = [
  'Summarize the attached variants and highlight the notable ones.',
  'Which of these variants could be pathogenic? Explain your reasoning.',
  'What is known about the most notable gene in this data? Search the web if needed.',
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

// Agent'ın yaptığı aramalar: "Searching: …"
function AgentSteps({ steps }) {
  return (
    <ul className="agent-steps" aria-label="Assistant steps">
      {steps.map((s, i) => (
        <li key={i}>
          <span aria-hidden="true">🔍</span> Searching: <span className="query">{s.query}</span>
        </li>
      ))}
    </ul>
  );
}

function Sources({ sources }) {
  return (
    <details className="sources">
      <summary>Sources ({sources.length})</summary>
      <ol>
        {sources.map((s) => (
          <li key={s.url}>
            <a href={safeUrl(s.url) || undefined} target="_blank" rel="noopener noreferrer nofollow">
              {s.title || s.url}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}

// Agent kullanıcıya soru sorup bekliyor. Seçeneğe basmak, o metni cevap olarak gönderir.
function QuestionCard({ question, onAnswer, disabled }) {
  return (
    <div className="question-card" role="group" aria-label="Question from the assistant">
      <p className="question-text">{question.question}</p>
      {question.options.length > 0 && (
        <div className="question-options">
          {question.options.map((o) => (
            <button key={o} type="button" disabled={disabled} onClick={() => onAnswer(o)}>
              {o}
            </button>
          ))}
        </div>
      )}
      <p className="hint">{question.options.length > 0 ? 'Choose an option or type your answer below.' : 'Type your answer below.'}</p>
    </div>
  );
}

function Message({ msg, isLast, streaming, waking, onCopy, onRetry, onAnswer }) {
  const isUser = msg.role === 'user';
  const steps = msg.steps || [];
  const sources = msg.sources || [];
  const isStreaming = msg.status === 'streaming';
  return (
    <article className={`msg ${msg.role} ${msg.status || ''}`}>
      {msg.attachments?.map((a) => (
        <div key={a.id} className="chip static" title={a.columns.join(', ')}>
          📎 {attachmentSummary(a)}
        </div>
      ))}
      {steps.length > 0 && <AgentSteps steps={steps} />}
      {isUser ? (
        <div className="msg-text plain">{msg.content}</div>
      ) : (
        <div className="msg-text">
          {msg.content ? (
            <SafeMarkdown text={msg.content} />
          ) : isStreaming && waking ? (
            <span className="typing">Server is waking up…</span>
          ) : isStreaming ? (
            <span className="typing">…</span>
          ) : null}
        </div>
      )}
      {msg.question && <QuestionCard question={msg.question} onAnswer={onAnswer} disabled={!isLast || streaming} />}
      {sources.length > 0 && <Sources sources={sources} />}
      {msg.status === 'error' && (
        <div className="error-card" role="alert">
          <span>{errorText(msg.error)}</span>
          {isLast && <RetryCountdown seconds={msg.retryAfter} onRetry={onRetry} />}
        </div>
      )}
      {msg.status === 'stopped' && <p className="hint">The response was interrupted.</p>}
      {!isStreaming && msg.content && (
        <div className="msg-actions">
          <button type="button" className="link" onClick={() => onCopy(msg.content)}>
            Copy
          </button>
        </div>
      )}
    </article>
  );
}

export default function ChatView({ settings, update, store, pendingData, setPendingData, active, onOpenSettings }) {
  const { current, mutate } = store;
  const { start, stop, streaming, waking } = useChatStream();
  const [draft, setDraft] = useState('');
  const [excludeIds, setExcludeIds] = useState(true);
  const [consent, setConsent] = useState(null);
  const [notice, setNotice] = useState(null);
  const [hasKey, setHasKey] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);

  const idCols = useMemo(() => (pendingData ? identifierColumns(pendingData.columns) : []), [pendingData]);
  const attachment = useMemo(() => {
    if (!pendingData) return null;
    return buildAttachment(pendingData, {
      maxChars: settings.maxAttachmentChars,
      excludeColumns: excludeIds ? idCols : [],
    });
  }, [pendingData, settings.maxAttachmentChars, excludeIds, idCols]);

  // Sekme her açıldığında erişim anahtarı var mı diye bakılır (Ayarlar'da değişmiş olabilir).
  useEffect(() => {
    if (!active) return;
    inputRef.current?.focus();
    sendToBackground({ type: MSG.GET_KEY_STATUS }).then((res) => setHasKey(!!res.hasKey));
  }, [active]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [current?.messages]);

  const flash = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 2500);
  };

  // Mesajı sunucuya gönderir ve gelen cevabı (adımlar, kaynaklar, soru, metin) yeni bir asistan
  // mesajına yazar. messages: kullanıcının mesajı dahil, ekranda görünecek liste.
  const runAgent = useCallback(
    (messages, text, attachmentText) => {
      const assistantId = newId();
      const placeholder = {
        id: assistantId,
        role: 'assistant',
        content: '',
        steps: [],
        sources: [],
        question: null,
        status: 'streaming',
        createdAt: Date.now(),
      };
      mutate((c) => ({ ...c, messages: [...messages, placeholder] }), false);

      const patch = (p, persist) =>
        mutate((c) => ({ ...c, messages: c.messages.map((m) => (m.id === assistantId ? { ...m, ...p } : m)) }), persist);

      start({
        threadId: current.id,
        message: text,
        attachment: attachmentText,
        onUpdate: (reply) => patch(reply, false),
        onDone: (reply) => patch({ ...reply, status: 'done' }, true),
        onError: (code, retryAfter, reply) =>
          patch(
            code === 'ABORTED' || (code === 'DISCONNECTED' && reply.content)
              ? { ...reply, status: 'stopped' }
              : { ...reply, status: 'error', error: code, retryAfter },
            true,
          ),
      });
    },
    [current?.id, mutate, start],
  );

  function doSend(text, att) {
    const userMsg = {
      id: newId(),
      role: 'user',
      content: text,
      attachments: att ? [{ ...att, id: newId() }] : [],
      createdAt: Date.now(),
    };
    if (current.messages.length === 0) mutate((c) => ({ ...c, title: titleFrom(text) }), false);
    setDraft('');
    if (att) setPendingData(null);
    stickToBottom.current = true;
    runAgent([...current.messages, userMsg], text, att?.text);
  }

  const msgs = current?.messages || [];
  const last = msgs.at(-1);
  // Agent bir soru sorup bekliyorsa sonraki mesaj o sorunun cevabıdır (ek gönderilmez, bekletilir).
  const awaitingAnswer = last?.role === 'assistant' && last.question && last.status === 'done';

  function send(text = draft.trim()) {
    if (!text || streaming || !current) return;
    if (text.length > LIMITS.MAX_USER_MESSAGE_CHARS) {
      flash(`A message can be at most ${LIMITS.MAX_USER_MESSAGE_CHARS} characters.`);
      return;
    }
    if (awaitingAnswer || !attachment) {
      doSend(text, null);
      return;
    }
    if (!settings.allowAiData || (settings.askEveryTime && !current.consentRemembered)) {
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

  // Hata sonrası: son kullanıcı mesajını (ve ekini) yeniden gönderir.
  function retry() {
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
    if (lastUser < 0) return;
    const m = msgs[lastUser];
    runAgent(msgs.slice(0, lastUser + 1), m.content, m.attachments?.at(-1)?.text);
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape' && streaming) stop();
  };

  if (!current) return <p className="empty">Loading…</p>;

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
            <p>
              Ask questions about your Varbank data. You can attach data from the Tables tab. The assistant can search
              the web and may ask you a question when your request is unclear.
            </p>
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
              waking={waking}
              onCopy={(t) => navigator.clipboard.writeText(t).then(() => flash('Copied.'), () => flash('Could not copy.'))}
              onRetry={retry}
              onAnswer={(option) => send(option)}
            />
          ))
        )}
      </div>

      {notice && <p className="notice ok" role="status">{notice}</p>}

      {hasKey === false && (
        <p className="notice warn">
          The AI chat needs an access key.{' '}
          <button type="button" className="link" onClick={onOpenSettings}>
            Add it in Settings
          </button>
        </p>
      )}

      <div className="composer">
        {attachment && (
          <div className={`chip ${attachment.includedRows < attachment.rowCount ? 'warn' : ''}`}>
            <span title={attachment.columns.join(', ')}>
              📎 {attachmentSummary(attachment)} · ~{formatTokens(attachment.tokens)} token
            </span>
            <button type="button" className="icon" aria-label="Remove attachment" onClick={() => setPendingData(null)}>
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
        {attachment && awaitingAnswer && (
          <p className="hint">The data will be attached to your next question, not to this answer.</p>
        )}
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder={awaitingAnswer ? 'Type your answer…' : attachment ? 'Ask about the attached data…' : 'Type a message…'}
          title="Enter to send · Shift+Enter for a new line · Esc to stop"
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
        <div className="composer-meta">
          {streaming ? (
            <button type="button" onClick={stop}>
              ■ Stop
            </button>
          ) : (
            <button type="button" className="primary" disabled={!draft.trim() || hasKey === false} onClick={() => send()}>
              Send
            </button>
          )}
        </div>
      </div>

      {consent && attachment && (
        <ConsentDialog
          attachment={attachment}
          identifierCols={idCols}
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
