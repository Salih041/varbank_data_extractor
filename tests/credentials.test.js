// Kurulum kimliği ve erişim anahtarı saklama (sahte chrome.storage ile).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAccessKey,
  getAccessKey,
  getInstallId,
  isValidAccessKeyFormat,
  keyStatus,
  removeOldGroqKey,
  saveAccessKey,
} from '../src/background/credentials.js';

function fakeArea() {
  const data = {};
  return {
    data,
    get: async (key) => (key in data ? { [key]: data[key] } : {}),
    set: async (obj) => Object.assign(data, obj),
    remove: async (key) => delete data[key],
  };
}

let local;
let session;
beforeEach(() => {
  local = fakeArea();
  session = fakeArea();
  vi.stubGlobal('chrome', { storage: { local, session } });
});

describe('kurulum kimliği', () => {
  it('bir kez üretilir ve sonra hep aynı kalır', async () => {
    const first = await getInstallId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getInstallId()).toBe(first);
  });
});

describe('erişim anahtarı', () => {
  it('biçim: en az 12 görünür karakter, boşluk yok', () => {
    expect(isValidAccessKeyFormat('varbank-kedi-2026')).toBe(true);
    expect(isValidAccessKeyFormat('short')).toBe(false);
    expect(isValidAccessKeyFormat('has a space 123')).toBe(false);
    expect(isValidAccessKeyFormat(null)).toBe(false);
  });

  it('kaydedilir; durum yalnızca son 4 karakteri gösterir', async () => {
    await saveAccessKey('varbank-kedi-2026', 'local');
    expect(await getAccessKey()).toBe('varbank-kedi-2026');
    expect(await keyStatus()).toEqual({ hasKey: true, last4: '2026', storage: 'local' });
  });

  it('oturumluk saklama seçilince kalıcı alana yazılmaz', async () => {
    await saveAccessKey('varbank-kedi-2026', 'local');
    await saveAccessKey('another-key-9999', 'session');
    expect(local.data.accessKey).toBeUndefined();
    expect(await keyStatus()).toMatchObject({ storage: 'session', last4: '9999' });
  });

  it('silinir', async () => {
    await saveAccessKey('varbank-kedi-2026', 'local');
    await clearAccessKey();
    expect(await keyStatus()).toEqual({ hasKey: false, last4: null, storage: null });
  });

  it('eski sürümden kalan Groq anahtarı temizlenir', async () => {
    local.data.groqApiKey = 'gsk_FAKEtest12345';
    await removeOldGroqKey();
    expect(local.data.groqApiKey).toBeUndefined();
  });
});
