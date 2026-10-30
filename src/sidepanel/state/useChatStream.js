// Service worker ile akışlı sohbet bağlantısı. Her istek için ayrı bir Port açılır.
// Agent'ın olayları (arama, kaynaklar, soru, cevap metni) tek bir "cevap" nesnesinde toplanır
// ve requestAnimationFrame ile arayüze aktarılır (her token'da render yok).

import { useCallback, useEffect, useRef, useState } from 'react';
import { PORT_CHAT } from '../../shared/messages.js';

// İlk olay bu süre içinde gelmezse sunucu muhtemelen uykudan uyanıyordur (Cloud Run).
const WAKING_AFTER_MS = 3000;
const MAX_SOURCES = 10;

export function useChatStream() {
  const portRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [waking, setWaking] = useState(false);

  const stop = useCallback(() => {
    const port = portRef.current;
    if (!port) return;
    try {
      port.postMessage({ type: 'abort' });
    } catch {
      // port zaten kapalı
    }
  }, []);

  useEffect(() => () => portRef.current?.disconnect(), []);

  /**
   * @param {{threadId:string, message:string, attachment?:string,
   *          onUpdate:(reply)=>void, onDone:(reply)=>void, onError:(code, retryAfter, reply)=>void}} p
   * reply = {content, steps:[{query}], sources:[{title,url}], question:{question,options}|null}
   */
  const start = useCallback(({ threadId, message, attachment, onUpdate, onDone, onError }) => {
    if (portRef.current) return false;
    const port = chrome.runtime.connect({ name: PORT_CHAT });
    portRef.current = port;
    setStreaming(true);
    setWaking(false);
    const wakingTimer = setTimeout(() => setWaking(true), WAKING_AFTER_MS);

    const reply = { content: '', steps: [], sources: [], question: null, thinking: false };
    let raf = 0;
    let finished = false;
    const snapshot = () => ({ ...reply, steps: [...reply.steps], sources: [...reply.sources] });
    const flush = () => {
      raf = 0;
      onUpdate(snapshot());
    };
    const finish = (fn) => {
      if (finished) return;
      finished = true;
      clearTimeout(wakingTimer);
      if (raf) cancelAnimationFrame(raf);
      fn(snapshot());
      portRef.current = null;
      setStreaming(false);
      setWaking(false);
      try {
        port.disconnect();
      } catch {
        // yoksay
      }
    };

    port.onMessage.addListener((m) => {
      clearTimeout(wakingTimer);
      setWaking(false);
      if (m.type === 'status') reply.thinking = true;
      else if (m.type === 'token') reply.content += m.text;
      else if (m.type === 'tool_start') reply.steps.push({ query: m.query });
      else if (m.type === 'tool_result') {
        for (const s of m.sources) {
          if (reply.sources.length < MAX_SOURCES && !reply.sources.some((x) => x.url === s.url)) reply.sources.push(s);
        }
      } else if (m.type === 'question') reply.question = { question: m.question, options: m.options };
      else if (m.type === 'done') return finish(onDone);
      else if (m.type === 'error') return finish((r) => onError(m.error, m.retryAfter, r));
      if (!raf) raf = requestAnimationFrame(flush);
    });
    port.onDisconnect.addListener(() => finish((r) => onError('DISCONNECTED', null, r)));
    port.postMessage({ type: 'start', threadId, message, attachment: attachment || null });
    return true;
  }, []);

  return { start, stop, streaming, waking };
}
