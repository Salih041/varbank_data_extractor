// Service worker: panel etkinleştirme, anahtar yönetimi ve Groq çağrıları.

import { MSG, PORT_CHAT } from '../shared/messages.js';
import { VARBANK_HOST, VARBANK_PATH_PREFIX } from '../shared/config.js';
import { LIMITS } from '../shared/limits.js';
import { redact } from '../shared/redact.js';
import { ApiError, listModels, streamChat } from './groqClient.js';

const KEY_NAME = 'groqApiKey';
const EXTENSION_ORIGIN = chrome.runtime.getURL('');

// --- İkon yalnızca Varbank sayfalarında tıklanabilir ------------------------
// İkon varsayılan olarak pasiftir; Chrome, URL kuralı eşleşen sekmelerde kendisi etkinleştirir
// (declarativeContent). Sekme URL'sini okuma izni gerektirmez; sayfa yenileme, geri/ileri
// (bfcache) ve eklenti yeniden yüklemesinden etkilenmez. İkona tıklayınca panel açılır.
// Panel pencere düzeyindedir: sekme değişince kapanmaz (sohbet akışı kesilmez); Varbank dışı
// sekmede Tablolar görünümü veri okumaz, yalnızca "Varbank bulunamadı" der.

async function initActionRules() {
  await chrome.action.disable();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.declarativeContent.onPageChanged.removeRules();
  await chrome.declarativeContent.onPageChanged.addRules([
    {
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { schemes: ['https'], hostEquals: VARBANK_HOST, pathPrefix: VARBANK_PATH_PREFIX },
        }),
      ],
      actions: [new chrome.declarativeContent.ShowAction()],
    },
  ]);
}

chrome.runtime.onInstalled.addListener(() => initActionRules().catch(() => {}));
chrome.runtime.onStartup.addListener(() => initActionRules().catch(() => {}));

// --- Anahtar saklama ---------------------------------------------------------
// Anahtar yalnızca burada okunur. Panel yalnızca "var/yok" ve son 4 karakteri görür.

async function getApiKey() {
  const s = await chrome.storage.session.get(KEY_NAME);
  if (s[KEY_NAME]) return s[KEY_NAME];
  const l = await chrome.storage.local.get(KEY_NAME);
  return l[KEY_NAME] || null;
}

async function keyStatus() {
  const s = await chrome.storage.session.get(KEY_NAME);
  const l = await chrome.storage.local.get(KEY_NAME);
  const key = s[KEY_NAME] || l[KEY_NAME];
  return { hasKey: !!key, last4: key ? key.slice(-4) : null, storage: s[KEY_NAME] ? 'session' : l[KEY_NAME] ? 'local' : null };
}

const KEY_RE = /^[A-Za-z0-9_-]{20,200}$/;

async function setApiKey(key, storage) {
  if (typeof key !== 'string' || !KEY_RE.test(key.trim())) throw new ApiError('BAD_REQUEST');
  key = key.trim();
  // Anahtarı kaydetmeden önce doğrula.
  await listModels({ apiKey: key });
  await chrome.storage.local.remove(KEY_NAME);
  await chrome.storage.session.remove(KEY_NAME);
  const area = storage === 'session' ? chrome.storage.session : chrome.storage.local;
  await area.set({ [KEY_NAME]: key });
}

async function clearApiKey() {
  await chrome.storage.local.remove(KEY_NAME);
  await chrome.storage.session.remove(KEY_NAME);
}

// --- Mesajlar -------------------------------------------------------------------

const fromExtensionPage = (sender) =>
  sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.startsWith(EXTENSION_ORIGIN);

const errorPayload = (e) => ({
  ok: false,
  error: e instanceof ApiError ? e.code : 'INTERNAL',
  retryAfter: e?.retryAfter ?? null,
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Yalnızca eklentinin kendi sayfaları (panel); content script ve web sayfaları reddedilir.
  if (!msg || typeof msg.type !== 'string' || !fromExtensionPage(sender)) return false;

  const handlers = {
    [MSG.GET_KEY_STATUS]: () => keyStatus(),
    [MSG.SET_API_KEY]: async () => {
      await setApiKey(msg.key, msg.storage);
      return keyStatus();
    },
    [MSG.CLEAR_API_KEY]: async () => {
      await clearApiKey();
      return keyStatus();
    },
    [MSG.LIST_MODELS]: async () => ({ models: await listModels({ apiKey: await getApiKey() }) }),
  };
  const handler = handlers[msg.type];
  if (!handler) return false;
  handler()
    .then((res) => sendResponse({ ok: true, ...res }))
    .catch((e) => sendResponse(errorPayload(e)));
  return true; // asenkron yanıt
});

// --- Akışlı sohbet ---------------------------------------------------------------

const ROLES = new Set(['system', 'user', 'assistant']);

function validateChatRequest(m) {
  if (!m || typeof m.model !== 'string' || !/^[\w./:-]{1,100}$/.test(m.model)) return false;
  if (!Array.isArray(m.messages) || m.messages.length === 0 || m.messages.length > 200) return false;
  let total = 0;
  for (const x of m.messages) {
    if (!x || !ROLES.has(x.role) || typeof x.content !== 'string') return false;
    total += x.content.length;
  }
  if (total > LIMITS.MAX_REQUEST_CHARS) return false;
  if (typeof m.temperature !== 'number' || m.temperature < 0 || m.temperature > 2) return false;
  return true;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_CHAT || !fromExtensionPage(port.sender)) {
    port.disconnect();
    return;
  }
  let controller = null;
  const post = (m) => {
    try {
      port.postMessage(m);
    } catch {
      controller?.abort();
    }
  };

  port.onDisconnect.addListener(() => controller?.abort());

  port.onMessage.addListener(async (m) => {
    if (m?.type === 'abort') {
      controller?.abort();
      return;
    }
    if (m?.type !== 'start' || controller) return;
    if (!validateChatRequest(m)) {
      post({ type: 'error', error: 'BAD_REQUEST' });
      return;
    }
    controller = new AbortController();
    try {
      const apiKey = await getApiKey();
      const result = await streamChat({
        apiKey,
        model: m.model,
        messages: m.messages.map(({ role, content }) => ({ role, content })),
        temperature: m.temperature,
        maxTokens: Math.min(Number(m.maxTokens) || LIMITS.DEFAULT_MAX_COMPLETION_TOKENS, 8192),
        signal: controller.signal,
        onDelta: (text) => post({ type: 'delta', text }),
      });
      post({ type: 'done', usage: result.usage, finishReason: result.finishReason });
    } catch (e) {
      const payload = errorPayload(e);
      if (!(e instanceof ApiError)) console.warn('chat error:', redact(e?.message));
      post({ type: 'error', error: payload.error, retryAfter: payload.retryAfter });
    } finally {
      controller = null;
    }
  });
});
