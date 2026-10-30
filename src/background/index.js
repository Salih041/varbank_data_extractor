// Service worker: panel etkinleştirme, erişim anahtarı ve agent sunucusuyla sohbet.

import { MSG, PORT_CHAT, isUuid } from '../shared/messages.js';
import { VARBANK_HOST, VARBANK_PATH_PREFIX } from '../shared/config.js';
import { LIMITS } from '../shared/limits.js';
import { redact } from '../shared/redact.js';
import { ApiError, checkAccessKey, deleteThread, streamAgentChat } from './agentClient.js';
import {
  clearAccessKey,
  getAccessKey,
  getInstallId,
  isValidAccessKeyFormat,
  keyStatus,
  removeOldGroqKey,
  saveAccessKey,
} from './credentials.js';

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

chrome.runtime.onInstalled.addListener(() => {
  initActionRules().catch(() => {});
  getInstallId().catch(() => {});
  removeOldGroqKey().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => initActionRules().catch(() => {}));

// --- Mesajlar -------------------------------------------------------------------

const fromExtensionPage = (sender) =>
  sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.startsWith(EXTENSION_ORIGIN);

const errorPayload = (e) => ({
  ok: false,
  error: e instanceof ApiError ? e.code : 'INTERNAL',
  retryAfter: e?.retryAfter ?? null,
});

async function setAccessKey(key, storage) {
  key = typeof key === 'string' ? key.trim() : '';
  if (!isValidAccessKeyFormat(key)) throw new ApiError('BAD_ACCESS_KEY');
  // Anahtarı kaydetmeden önce sunucuda doğrula.
  await checkAccessKey({ accessKey: key });
  await saveAccessKey(key, storage);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Yalnızca eklentinin kendi sayfaları (panel); content script ve web sayfaları reddedilir.
  if (!msg || typeof msg.type !== 'string' || !fromExtensionPage(sender)) return false;

  const handlers = {
    [MSG.GET_KEY_STATUS]: () => keyStatus(),
    [MSG.SET_ACCESS_KEY]: async () => {
      await setAccessKey(msg.key, msg.storage);
      return keyStatus();
    },
    [MSG.CLEAR_ACCESS_KEY]: async () => {
      await clearAccessKey();
      return keyStatus();
    },
    [MSG.DELETE_THREAD]: async () => {
      if (!isUuid(msg.threadId)) throw new ApiError('BAD_REQUEST');
      await deleteThread({ accessKey: await getAccessKey(), installId: await getInstallId(), threadId: msg.threadId });
      return {};
    },
  };
  const handler = handlers[msg.type];
  if (!handler) return false;
  handler()
    .then((res) => sendResponse({ ok: true, ...res }))
    .catch((e) => sendResponse(errorPayload(e)));
  return true; // asenkron yanıt
});

// --- Akışlı sohbet ---------------------------------------------------------------

function validateChatStart(m) {
  if (!isUuid(m.threadId)) return false;
  if (typeof m.message !== 'string' || !m.message.trim() || m.message.length > LIMITS.MAX_USER_MESSAGE_CHARS) return false;
  if (m.attachment != null) {
    if (typeof m.attachment !== 'string' || m.attachment.length > LIMITS.HARD_MAX_ATTACHMENT_CHARS) return false;
  }
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
    if (!validateChatStart(m)) {
      post({ type: 'error', error: 'BAD_REQUEST' });
      return;
    }
    controller = new AbortController();
    try {
      await streamAgentChat({
        accessKey: await getAccessKey(),
        installId: await getInstallId(),
        threadId: m.threadId,
        message: m.message,
        attachment: m.attachment || null,
        signal: controller.signal,
        onEvent: post, // sunucunun olayları (doğrulanmış halleriyle) olduğu gibi panele gider
      });
    } catch (e) {
      const payload = errorPayload(e);
      if (!(e instanceof ApiError)) console.warn('chat error:', redact(e?.message));
      post({ type: 'error', error: payload.error, retryAfter: payload.retryAfter });
    } finally {
      controller = null;
    }
  });
});
