// Panelin chrome API sarmalayıcıları.

import { isVarbankUrl } from '../shared/config.js';
import { MSG } from '../shared/messages.js';

/**
 * Sekme Varbank ise {id, url}, değilse null.
 * tab.url, site erişimi kısıtlıysa (ör. "tıklandığında") boş gelebilir. Bu durumda content
 * script'e ping atılır: content script yalnızca Varbank'ta enjekte edildiği için yanıt
 * vermesi sekmenin Varbank olduğunu gösterir.
 */
export async function asVarbankTab(tab) {
  if (!tab || tab.id == null) return null;
  if (isVarbankUrl(tab.url)) return { id: tab.id, url: tab.url };
  if (tab.url) return null; // URL biliniyor ve Varbank değil
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: MSG.PING });
    return res?.ok && res.site === 'varbank2' ? { id: tab.id, url: null } : null;
  } catch {
    return null;
  }
}

/** Panelin bulunduğu penceredeki aktif sekme. */
export async function getActiveVarbankTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return asVarbankTab(tab);
}

export async function sendToTab(tabId, msg) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, msg);
    return res ?? { ok: false, error: 'NO_RESPONSE' };
  } catch {
    // Content script henüz yüklenmemiş (ör. eklenti sayfa açıkken kuruldu).
    return { ok: false, error: 'NO_CONTENT_SCRIPT' };
  }
}

export async function sendToBackground(msg) {
  try {
    return (await chrome.runtime.sendMessage(msg)) ?? { ok: false, error: 'NO_RESPONSE' };
  } catch {
    return { ok: false, error: 'INTERNAL' };
  }
}

export const ERROR_TEXT = {
  NO_ACCESS_KEY: 'No access key set. Add one in the Settings tab.',
  BAD_ACCESS_KEY: 'The access key is not valid.',
  TOO_MANY_ATTEMPTS: 'Too many wrong access keys. Try again in 15 minutes.',
  RATE_LIMIT: 'The AI model is busy (per-minute limit reached). Wait a moment and try again.',
  TOO_LARGE: "This request is too large for the AI model's per-minute limit. Attach fewer rows or columns.",
  TOO_MANY_STEPS: 'The assistant could not finish this request. Try asking more specifically.',
  SERVER: 'The AI service is not responding right now. Try again later.',
  NETWORK: 'Could not reach the AI server. Check your internet connection.',
  ABORTED: 'Response stopped.',
  BAD_RESPONSE: 'Unexpected response from the AI service.',
  BAD_REQUEST: 'Invalid request.',
  DISCONNECTED: 'Connection lost. Try again.',
  NO_CONTENT_SCRIPT: 'Could not connect to the page. Reload the Varbank tab (F5).',
  GRID_NOT_FOUND: 'Table not found on the page. Refresh the list.',
  NO_COLUMNS: 'Select at least one column.',
  PARSE_FAILED: 'Could not read the table.',
  INTERNAL: 'An unexpected error occurred.',
  NO_RESPONSE: 'No response received.',
};

export const errorText = (code) => ERROR_TEXT[code] || ERROR_TEXT.INTERNAL;
