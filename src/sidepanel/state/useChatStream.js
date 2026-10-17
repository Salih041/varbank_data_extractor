// Service worker ile akışlı sohbet bağlantısı. Her istek için ayrı bir Port açılır;
// parçalar requestAnimationFrame ile toplanarak arayüze aktarılır (her token'da render yok).

import { useCallback, useEffect, useRef, useState } from 'react';
import { PORT_CHAT } from '../../shared/messages.js';

export function useChatStream() {
  const portRef = useRef(null);
  const [streaming, setStreaming] = useState(false);

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
   * @param {{model:string, messages:Array, temperature:number, maxTokens:number,
   *          onText:(full:string)=>void, onDone:(info)=>void, onError:(code, retryAfter)=>void}} p
   */
  const start = useCallback(({ model, messages, temperature, maxTokens, onText, onDone, onError }) => {
    if (portRef.current) return false;
    const port = chrome.runtime.connect({ name: PORT_CHAT });
    portRef.current = port;
    setStreaming(true);

    let text = '';
    let raf = 0;
    let finished = false;
    const flush = () => {
      raf = 0;
      onText(text);
    };
    const finish = (fn) => {
      if (finished) return;
      finished = true;
      if (raf) cancelAnimationFrame(raf);
      onText(text);
      fn();
      portRef.current = null;
      setStreaming(false);
      try {
        port.disconnect();
      } catch {
        // yoksay
      }
    };

    port.onMessage.addListener((m) => {
      if (m.type === 'delta' && typeof m.text === 'string') {
        text += m.text;
        if (!raf) raf = requestAnimationFrame(flush);
      } else if (m.type === 'done') {
        finish(() => onDone({ usage: m.usage, finishReason: m.finishReason }));
      } else if (m.type === 'error') {
        finish(() => onError(m.error, m.retryAfter, text));
      }
    });
    port.onDisconnect.addListener(() => finish(() => onError('DISCONNECTED', null, text)));
    port.postMessage({ type: 'start', model, messages, temperature, maxTokens });
    return true;
  }, []);

  return { start, stop, streaming };
}
