// Ayarlar (erişim anahtarı formu, sadeleşen ayarlar) ve konuşma silmenin sunucuya iletilmesi.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MSG } from '../src/shared/messages.js';
import { normalize } from '../src/sidepanel/state/settings.js';
import { useConversations } from '../src/sidepanel/state/conversations.js';
import SettingsView from '../src/sidepanel/settings/SettingsView.jsx';

function fakeArea() {
  const data = {};
  return {
    data,
    get: async (key) => (key === null ? { ...data } : key in data ? { [key]: data[key] } : {}),
    set: async (obj) => Object.assign(data, obj),
    remove: async (keys) => [].concat(keys).forEach((k) => delete data[k]),
  };
}

let sendMessage;
let local;
beforeEach(() => {
  local = fakeArea();
  sendMessage = vi.fn(async (msg) => {
    if (msg.type === MSG.GET_KEY_STATUS) return { ok: true, hasKey: false, last4: null, storage: null };
    if (msg.type === MSG.SET_ACCESS_KEY)
      return msg.key === 'varbank-kedi-2026'
        ? { ok: true, hasKey: true, last4: '2026', storage: 'local' }
        : { ok: false, error: 'BAD_ACCESS_KEY' };
    return { ok: true };
  });
  vi.stubGlobal('chrome', { storage: { local }, runtime: { sendMessage } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sentOfType = (type) => sendMessage.mock.calls.map(([m]) => m).filter((m) => m.type === type);

describe('ayarlar', () => {
  it('eski sürümden kalan model/temperature alanlarını atar', () => {
    const s = normalize({ model: 'llama', temperature: 0.7, contextWindow: 8000, textSize: 'lg' });
    expect(s).not.toHaveProperty('model');
    expect(s).not.toHaveProperty('temperature');
    expect(s).not.toHaveProperty('contextWindow');
    expect(s.textSize).toBe('lg');
  });

  it('tablo sınırı varsayılanı 12.000; eski varsayılan 40.000 yeniye çekilir', () => {
    expect(normalize({}).maxAttachmentChars).toBe(12_000);
    expect(normalize({ maxAttachmentChars: 40_000 }).maxAttachmentChars).toBe(12_000);
    // Kullanıcının elle seçtiği değer korunur.
    expect(normalize({ maxAttachmentChars: 20_000 }).maxAttachmentChars).toBe(20_000);
    expect(normalize({ settingsVersion: 2, maxAttachmentChars: 40_000 }).maxAttachmentChars).toBe(40_000);
  });
});

describe('erişim anahtarı formu', () => {
  function renderSettings() {
    render(<SettingsView settings={normalize({})} update={() => {}} onClearHistory={() => {}} />);
    return screen.getByLabelText('Access key');
  }

  it('model seçimi ve Groq anahtarı alanı artık yok', () => {
    renderSettings();
    expect(screen.queryByText(/Groq API key/)).toBeNull();
    expect(screen.queryByText('Load models')).toBeNull();
    expect(screen.queryByText('Temperature')).toBeNull();
  });

  it('12 karakterden kısa anahtarla kaydet düğmesi kapalı', () => {
    const input = renderSettings();
    fireEvent.change(input, { target: { value: 'short' } });
    expect(screen.getByText('Verify and save').disabled).toBe(true);
  });

  it('doğru anahtar doğrulanıp kaydedilir', async () => {
    const input = renderSettings();
    fireEvent.change(input, { target: { value: 'varbank-kedi-2026' } });
    fireEvent.click(screen.getByText('Verify and save'));

    await screen.findByText('Access key verified and saved.');
    expect(sentOfType(MSG.SET_ACCESS_KEY)[0]).toMatchObject({ key: 'varbank-kedi-2026', storage: 'local' });
    expect(screen.getByText('••••2026')).toBeTruthy();
    expect(input.value).toBe(''); // anahtar arayüzde kalmaz
  });

  it('yanlış anahtarda hata gösterir', async () => {
    const input = renderSettings();
    fireEvent.change(input, { target: { value: 'wrong-key-123456' } });
    fireEvent.click(screen.getByText('Verify and save'));
    await screen.findByText('The access key is not valid.');
  });
});

describe('konuşma silme', () => {
  async function storeWithTwoChats() {
    local.data.conv_index = [{ id: 'a' }, { id: 'b' }];
    local.data['conv:a'] = { id: 'a', title: 'A', messages: [{ role: 'user', content: 'x' }] };
    local.data['conv:b'] = { id: 'b', title: 'B', messages: [{ role: 'user', content: 'y' }] };
    const { result } = renderHook(() => useConversations(true));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    return result;
  }

  it('silinen konuşma sunucudan da silinir', async () => {
    const result = await storeWithTwoChats();
    await act(() => result.current.remove('b'));
    expect(sentOfType(MSG.DELETE_THREAD)).toEqual([{ type: MSG.DELETE_THREAD, threadId: 'b' }]);
    expect(local.data['conv:b']).toBeUndefined();
  });

  it('tüm geçmiş silinince hepsi sunucudan da silinir', async () => {
    const result = await storeWithTwoChats();
    await act(() => result.current.removeAll());
    expect(sentOfType(MSG.DELETE_THREAD).map((m) => m.threadId).sort()).toEqual(['a', 'b']);
  });

  it('yeni konuşmanın kimliği sunucu için geçerli bir UUID', () => {
    const { result } = renderHook(() => useConversations(false));
    return waitFor(() => expect(result.current.current?.id).toMatch(/^[0-9a-f-]{36}$/));
  });
});
