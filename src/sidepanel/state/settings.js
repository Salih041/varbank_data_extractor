import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from '../../shared/config.js';
import { clampAttachmentChars } from '../../shared/limits.js';

const KEY = 'settings';

function normalize(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.temperature = Math.min(2, Math.max(0, Number(s.temperature) || 0));
  s.maxAttachmentChars = clampAttachmentChars(s.maxAttachmentChars);
  for (const k of ['allowAiData', 'askEveryTime', 'saveHistory']) s[k] = !!s[k];
  s.keyStorage = s.keyStorage === 'session' ? 'session' : 'local';
  s.model = typeof s.model === 'string' && s.model ? s.model : DEFAULT_SETTINGS.model;
  if (s.contextWindow != null) s.contextWindow = Number(s.contextWindow) || null;
  return s;
}

export function useSettings() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    chrome.storage.local.get(KEY).then((r) => setSettings(normalize(r[KEY])));
    const onChange = (changes, area) => {
      if (area === 'local' && changes[KEY]) setSettings(normalize(changes[KEY].newValue));
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const update = useCallback(async (patch) => {
    const current = normalize((await chrome.storage.local.get(KEY))[KEY]);
    const next = normalize({ ...current, ...patch });
    await chrome.storage.local.set({ [KEY]: next });
    setSettings(next);
    return next;
  }, []);

  return [settings, update];
}
