// Sohbet deposu. chrome.storage.local içinde:
//   conv_index      -> [{id, title, createdAt, updatedAt}]  (yeniden eskiye)
//   conv:<id>       -> {id, title, createdAt, updatedAt, consentRemembered, messages:[...]}
// "Geçmişi kaydet" kapalıysa hiçbir şey diske yazılmaz, yalnızca bellekte tutulur.

import { useCallback, useEffect, useRef, useState } from 'react';
import { LIMITS } from '../../shared/limits.js';

const INDEX_KEY = 'conv_index';
const convKey = (id) => `conv:${id}`;

export const newId = () => crypto.randomUUID();

export function makeConversation() {
  const now = Date.now();
  return { id: newId(), title: 'New chat', createdAt: now, updatedAt: now, consentRemembered: false, messages: [] };
}

export function titleFrom(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > 40 ? t.slice(0, 40) + '…' : t || 'New chat';
}

const meta = ({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt });

export function useConversations(saveHistory) {
  const [index, setIndex] = useState([]);
  const [current, setCurrent] = useState(null);
  const currentRef = useRef(null);
  currentRef.current = current;
  const persistRef = useRef(saveHistory);
  persistRef.current = saveHistory;

  useEffect(() => {
    if (saveHistory === undefined) return;
    (async () => {
      if (!saveHistory) {
        setIndex([]);
        setCurrent(makeConversation());
        return;
      }
      const idx = (await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY] || [];
      setIndex(idx);
      if (idx[0]) {
        const c = (await chrome.storage.local.get(convKey(idx[0].id)))[convKey(idx[0].id)];
        setCurrent(c || makeConversation());
      } else setCurrent(makeConversation());
    })();
  }, [saveHistory]);

  const persist = useCallback(async (conv) => {
    if (!persistRef.current || conv.messages.length === 0) return;
    // Yarım kalmış akış diske "durduruldu" olarak yazılır.
    const stored = {
      ...conv,
      messages: conv.messages.map((m) => (m.status === 'streaming' ? { ...m, status: 'stopped' } : m)),
    };
    const idx = ((await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY] || []).filter((x) => x.id !== conv.id);
    idx.unshift(meta(conv));
    const overflow = idx.splice(LIMITS.MAX_CONVERSATIONS);
    await chrome.storage.local.set({ [INDEX_KEY]: idx, [convKey(conv.id)]: stored });
    if (overflow.length) await chrome.storage.local.remove(overflow.map((x) => convKey(x.id)));
    setIndex(idx);
  }, []);

  /** conv'u değiştirir; persistNow=false iken (akış sırasında) diske yazmaz. */
  const mutate = useCallback(
    (fn, persistNow = true) => {
      const prev = currentRef.current;
      if (!prev) return null;
      const next = { ...fn(prev), updatedAt: Date.now() };
      currentRef.current = next;
      setCurrent(next);
      if (persistNow) persist(next).catch(() => {});
      return next;
    },
    [persist],
  );

  const select = useCallback(async (id) => {
    const c = (await chrome.storage.local.get(convKey(id)))[convKey(id)];
    if (c) setCurrent(c);
  }, []);

  const startNew = useCallback(() => setCurrent(makeConversation()), []);

  const remove = useCallback(async (id) => {
    const idx = ((await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY] || []).filter((x) => x.id !== id);
    await chrome.storage.local.set({ [INDEX_KEY]: idx });
    await chrome.storage.local.remove(convKey(id));
    setIndex(idx);
    if (currentRef.current?.id === id) setCurrent(makeConversation());
  }, []);

  const rename = useCallback(
    async (id, title) => {
      const clean = titleFrom(title);
      if (currentRef.current?.id === id) {
        mutate((c) => ({ ...c, title: clean }));
        return;
      }
      const c = (await chrome.storage.local.get(convKey(id)))[convKey(id)];
      if (c) await persist({ ...c, title: clean });
    },
    [mutate, persist],
  );

  const removeAll = useCallback(async () => {
    const all = await chrome.storage.local.get(null);
    await chrome.storage.local.remove(Object.keys(all).filter((k) => k === INDEX_KEY || k.startsWith('conv:')));
    setIndex([]);
    setCurrent(makeConversation());
  }, []);

  return { index, current, mutate, select, startNew, remove, rename, removeAll };
}
