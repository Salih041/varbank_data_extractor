import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchGrids } from '../src/content/gridWatcher.js';
import { VARIANT_GRID_HTML } from './fixtures/varbankGrid.js';

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

let stop;
beforeEach(() => {
  document.body.innerHTML = VARIANT_GRID_HTML + '<div id="overDiv" style="left:0"></div>';
});
afterEach(() => stop?.());

describe('watchGrids', () => {
  it('grid içinde satır seçimi değişince bildirir', async () => {
    const spy = vi.fn();
    stop = watchGrids(document.body, spy, 10);
    document.querySelector('#list10 tr#\\32').classList.add('ui-state-highlight');
    await tick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('site grid kutusunu YENİ öğeyle değiştirdiğinde (Show variations) yeni grid\'i de izler', async () => {
    const spy = vi.fn();
    stop = watchGrids(document.body, spy, 10);

    // Varbank'ın yaptığı gibi: eski gbox kaldırılır, yerine yenisi konur.
    const old = document.getElementById('gbox_list10');
    const fresh = old.cloneNode(true);
    old.replaceWith(fresh);
    await tick();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(old.isConnected).toBe(false);

    // Yeni grid'de satır seçimi de bildirilmeli (eski hata: bildirilmiyordu).
    fresh.querySelector('tr#\\32').classList.add('ui-state-highlight');
    await tick();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('sekme paneli görünürlüğü değişince bildirir', async () => {
    const spy = vi.fn();
    stop = watchGrids(document.body, spy, 10);
    document.getElementById('tabs-2').style.display = 'block';
    await tick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('grid dışındaki alakasız değişiklikleri (tooltip vb.) yok sayar', async () => {
    const spy = vi.fn();
    stop = watchGrids(document.body, spy, 10);
    document.getElementById('overDiv').style.left = '120px';
    document.body.appendChild(document.createElement('span'));
    await tick();
    expect(spy).not.toHaveBeenCalled();
  });

  it('art arda değişiklikleri tek bildirimde birleştirir', async () => {
    const spy = vi.fn();
    stop = watchGrids(document.body, spy, 20);
    for (const id of ['1', '2', '3']) document.getElementById('list10').querySelector(`tr[id="${id}"]`).classList.toggle('ui-state-highlight');
    await tick(60);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
