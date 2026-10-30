import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, textSizeOf } from '../../shared/config.js';
import { clampAttachmentChars } from '../../shared/limits.js';

const KEY = 'settings';

// 2: tablo sınırının varsayılanı 40.000'den 12.000 karaktere indi (Groq ücretsiz planı).
const SETTINGS_VERSION = 2;
const OLD_DEFAULT_ATTACHMENT_CHARS = 40_000;

export function normalize(raw) {
  const r = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  // Eski sürümden kalan eski varsayılan, yeni varsayılana çekilir. Kullanıcının elle seçtiği
  // başka bir değer korunur.
  if (r.settingsVersion !== SETTINGS_VERSION && r.maxAttachmentChars === OLD_DEFAULT_ATTACHMENT_CHARS) {
    r.maxAttachmentChars = DEFAULT_SETTINGS.maxAttachmentChars;
  }
  // Yalnızca bilinen alanlar alınır; eski sürümlerden kalanlar (model, temperature, contextWindow) düşer.
  return {
    settingsVersion: SETTINGS_VERSION,
    maxAttachmentChars: clampAttachmentChars(r.maxAttachmentChars),
    allowAiData: !!r.allowAiData,
    askEveryTime: !!r.askEveryTime,
    saveHistory: !!r.saveHistory,
    keyStorage: r.keyStorage === 'session' ? 'session' : 'local',
    textSize: textSizeOf(r.textSize).id,
  };
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
