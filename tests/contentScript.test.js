import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VARIANT_GRID_HTML } from './fixtures/varbankGrid.js';

const tick = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const toggleRow = (id) => document.getElementById('list10').querySelector(`tr[id="${id}"]`).classList.toggle('ui-state-highlight');

let runtime;

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = VARIANT_GRID_HTML;
  runtime = {
    id: 'ext',
    sendMessage: vi.fn(() => Promise.resolve()),
    onMessage: { addListener: vi.fn() },
  };
  globalThis.chrome = { runtime };
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('content script değişiklik bildirimi', () => {
  it('satır seçimi değişince panele GRIDS_CHANGED yollar', async () => {
    await import('../src/content/index.js');
    toggleRow('2');
    await tick();
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'GRIDS_CHANGED' });
  });

  it('eklenti yeniden yüklenince (bağlam geçersiz) hata fırlatmaz ve izlemeyi durdurur', async () => {
    await import('../src/content/index.js');
    const errors = [];
    const onError = (e) => errors.push(e.error);
    window.addEventListener('error', onError);

    // Chrome'un davranışı: id kaybolur, sendMessage senkron fırlatır.
    delete runtime.id;
    runtime.sendMessage.mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });

    toggleRow('2');
    await tick();
    toggleRow('3');
    await tick();

    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('sendMessage senkron fırlatırsa yakalar ve sonraki değişikliklerde tekrar denemez', async () => {
    await import('../src/content/index.js');
    runtime.sendMessage.mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });
    toggleRow('2');
    await tick();
    toggleRow('3');
    await tick();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  });
});
