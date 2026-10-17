import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TablesView from '../src/sidepanel/tables/TablesView.jsx';

const COLS = [
  { key: '1', label: 'Chr', hidden: false },
  { key: '14', label: 'HGNC', hidden: false },
];
const GRID = {
  gridId: 'list10', caption: 'Variation Data', tabId: 'tabs-3', tabLabel: 'Variants', visible: true, loading: false,
  rowCount: 3, selectedCount: 1, multiselect: true, pagingInfo: 'View 1 - 3 of 3', columns: COLS,
};

let sent;
let runtimeListeners;

beforeEach(() => {
  sent = [];
  runtimeListeners = [];
  globalThis.chrome = {
    runtime: {
      id: 'ext',
      onMessage: { addListener: (f) => runtimeListeners.push(f), removeListener: () => {} },
    },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    tabs: {
      sendMessage: vi.fn(async (_tabId, msg) => {
        sent.push(msg);
        if (msg.type === 'LIST_GRIDS') return { ok: true, loggedIn: true, grids: [{ ...GRID }] };
        if (msg.type === 'PREVIEW_ROWS')
          return {
            ok: true,
            preview: {
              columns: COLS,
              rows: [
                { id: '1', selected: true, values: ['1', 'PEX10'] },
                { id: '2', selected: false, values: ['1', 'CLSTN1'] },
                { id: '3', selected: false, values: ['2', 'EPHA8'] },
              ],
            },
          };
        if (msg.type === 'EXTRACT')
          return { ok: true, totalMatched: 0, truncated: false, data: { source: {}, columns: ['Chr'], rows: [] } };
        return { ok: false };
      }),
    },
  };
});

afterEach(() => cleanup());

describe('TablesView elle satır seçimi', () => {
  it('işaretlenen satırları EXTRACT isteğine rowIds olarak gönderir', async () => {
    render(<TablesView tab={{ id: 7, url: 'https://varbank.ccg.uni-koeln.de/varbank2/' }} onAttach={() => {}} />);
    await screen.findByText(/Selected on site/);

    fireEvent.click(screen.getByLabelText(/Pick manually/));
    await screen.findByLabelText('Row 2');
    // Elle seçim, sitede seçili satırla (1) başlar.
    await waitFor(() => expect(screen.getByLabelText('Row 1').checked).toBe(true));
    fireEvent.click(screen.getByLabelText('Row 1'));
    fireEvent.click(screen.getByLabelText('Row 2'));
    fireEvent.click(screen.getByLabelText('Row 3'));
    expect(screen.getByLabelText(/Pick manually \(2\)/)).toBeTruthy();

    // Grid listesi bir an hata dönüp geri gelirse (sayfa meşgul vb.) elle seçim KORUNMALI.
    let failOnce = true;
    const original = chrome.tabs.sendMessage.getMockImplementation();
    chrome.tabs.sendMessage.mockImplementation(async (tabId, msg) => {
      if (msg.type === 'LIST_GRIDS' && failOnce) {
        failOnce = false;
        sent.push(msg);
        return { ok: false, error: 'NO_RESPONSE' };
      }
      return original(tabId, msg);
    });
    const notify = () =>
      act(async () => {
        runtimeListeners.forEach((l) => l({ type: 'GRIDS_CHANGED' }, { id: 'ext', tab: { id: 7 } }));
      });
    await notify();
    await screen.findByText('No response received.');
    await notify();
    await screen.findByLabelText('Row 2');
    expect(screen.getByLabelText(/Pick manually \(2\)/).checked).toBe(true);
    expect(screen.getByLabelText('Row 1').checked).toBe(false);
    expect(screen.getByLabelText('Row 2').checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Extract data/ }));
    await waitFor(() => expect(sent.some((m) => m.type === 'EXTRACT')).toBe(true));
    const req = sent.find((m) => m.type === 'EXTRACT');
    expect(req.rowMode).toBe('ids');
    expect(req.rowIds.sort()).toEqual(['2', '3']);
  });

  it('site grid\'i yeniden oluşturunca (yeni nesil) eski elle seçim geçersiz sayılır', async () => {
    let generation = 1;
    const original = chrome.tabs.sendMessage.getMockImplementation();
    chrome.tabs.sendMessage.mockImplementation(async (tabId, msg) => {
      const res = await original(tabId, msg);
      if (msg.type === 'LIST_GRIDS') res.grids = res.grids.map((g) => ({ ...g, generation }));
      if (msg.type === 'PREVIEW_ROWS') res.preview.rows.forEach((r) => (r.selected = false));
      return res;
    });
    render(<TablesView tab={{ id: 7, url: null }} onAttach={() => {}} />);
    await screen.findByText(/All visible/);
    fireEvent.click(screen.getByLabelText(/Pick manually/));
    await screen.findByLabelText('Row 2');
    fireEvent.click(screen.getByLabelText('Row 2'));
    expect(screen.getByLabelText(/Pick manually \(1\)/)).toBeTruthy();

    generation = 2; // Show variations: aynı kimlikler, farklı satırlar
    await act(async () => {
      runtimeListeners.forEach((l) => l({ type: 'GRIDS_CHANGED' }, { id: 'ext', tab: { id: 7 } }));
    });
    await screen.findByLabelText(/Pick manually \(0\)/);
    await screen.findByLabelText('Row 2');
    expect(screen.getByLabelText('Row 2').checked).toBe(false);
  });

  it('ekrandaki tabloyu en üstte ve vurgulu, gizli tabloları etiketli gösterir', async () => {
    const original = chrome.tabs.sendMessage.getMockImplementation();
    chrome.tabs.sendMessage.mockImplementation(async (tabId, msg) => {
      const res = await original(tabId, msg);
      if (msg.type === 'LIST_GRIDS')
        res.grids = [
          { ...GRID, gridId: 'list9', caption: 'Select Data Sets', visible: false, rowCount: 10 },
          { ...GRID, gridId: 'list15', caption: 'Target Coverage', visible: false, rowCount: 0 },
          { ...GRID, visible: true },
        ];
      return res;
    });
    render(<TablesView tab={{ id: 7, url: null }} onAttach={() => {}} />);
    await screen.findByText(/Selected on site/);

    // Kapalı açılır liste: seçili (ekrandaki) tabloyu vurgulu gösterir.
    const trigger = document.querySelector('.grid-trigger');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.className).toContain('on-screen');
    expect(trigger.textContent).toContain('Variation Data');
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    fireEvent.click(trigger);
    const items = screen.getAllByRole('option');
    expect(items.map((b) => b.querySelector('.grid-caption').textContent)).toEqual([
      'Variation Data',
      'Select Data Sets',
      'Target Coverage',
    ]);
    expect(items[0].className).toContain('on-screen');
    expect(items[0].textContent).toContain('On screen');
    expect(items[0].getAttribute('aria-selected')).toBe('true');
    expect(items[1].className).toContain('off-screen');
    expect(items[1].textContent).toContain('Hidden');
    expect(items[2].className).toContain('empty');

    // Klavye: ↓ ile ikinci seçeneğe geç, Enter ile seç → liste kapanır, tetikleyici güncellenir.
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.querySelector('.grid-trigger').textContent).toContain('Select Data Sets');
    expect(document.querySelector('.grid-trigger').className).toContain('off-screen');
  });

  it('başka bir sekmeye geçilince seçimler sıfırlanır', async () => {
    const { rerender } = render(<TablesView tab={{ id: 7, url: null }} onAttach={() => {}} />);
    await screen.findByText(/Selected on site/);
    fireEvent.click(screen.getByLabelText(/All visible/));
    expect(screen.getByLabelText(/All visible/).checked).toBe(true);
    rerender(<TablesView tab={{ id: 8, url: null }} onAttach={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/Selected on site/).checked).toBe(true));
  });
});
