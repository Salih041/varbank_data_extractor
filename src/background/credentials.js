// Kurulum kimliği ve erişim anahtarı. Anahtar yalnızca service worker'da okunur;
// panel yalnızca "var/yok" bilgisini ve son 4 karakteri görür.

const INSTALL_ID_KEY = 'installId';
const ACCESS_KEY_NAME = 'accessKey';
const OLD_GROQ_KEY_NAME = 'groqApiKey'; // 1.x sürümlerinden kalan anahtar

// Görünür ASCII, boşluksuz; sunucu en az 12 karakter ister.
const ACCESS_KEY_RE = /^[\x21-\x7E]{12,200}$/;

export const isValidAccessKeyFormat = (key) => typeof key === 'string' && ACCESS_KEY_RE.test(key);

// Her kurulumun rastgele kimliği. Sunucu konuşmaları bu kimlikle ayırır.
export async function getInstallId() {
  const stored = await chrome.storage.local.get(INSTALL_ID_KEY);
  if (stored[INSTALL_ID_KEY]) return stored[INSTALL_ID_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: id });
  return id;
}

export async function getAccessKey() {
  const s = await chrome.storage.session.get(ACCESS_KEY_NAME);
  if (s[ACCESS_KEY_NAME]) return s[ACCESS_KEY_NAME];
  const l = await chrome.storage.local.get(ACCESS_KEY_NAME);
  return l[ACCESS_KEY_NAME] || null;
}

export async function keyStatus() {
  const s = await chrome.storage.session.get(ACCESS_KEY_NAME);
  const l = await chrome.storage.local.get(ACCESS_KEY_NAME);
  const key = s[ACCESS_KEY_NAME] || l[ACCESS_KEY_NAME];
  return {
    hasKey: !!key,
    last4: key ? key.slice(-4) : null,
    storage: s[ACCESS_KEY_NAME] ? 'session' : l[ACCESS_KEY_NAME] ? 'local' : null,
  };
}

// storage: 'local' (kalıcı) veya 'session' (tarayıcı kapanınca silinir).
export async function saveAccessKey(key, storage) {
  await clearAccessKey();
  const area = storage === 'session' ? chrome.storage.session : chrome.storage.local;
  await area.set({ [ACCESS_KEY_NAME]: key });
}

export async function clearAccessKey() {
  await chrome.storage.local.remove(ACCESS_KEY_NAME);
  await chrome.storage.session.remove(ACCESS_KEY_NAME);
}

// Eski sürümden kalan Groq anahtarı artık kullanılmıyor; cihazda bırakılmaz.
export async function removeOldGroqKey() {
  await chrome.storage.local.remove(OLD_GROQ_KEY_NAME);
  await chrome.storage.session.remove(OLD_GROQ_KEY_NAME);
}
