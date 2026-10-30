import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { buildAttachment, identifierColumns } from '../src/sidepanel/chat/attachment.js';
import SafeMarkdown, { linkifyCitations } from '../src/sidepanel/chat/SafeMarkdown.jsx';
import ChatView from '../src/sidepanel/chat/ChatView.jsx';
import { MSG } from '../src/shared/messages.js';
import { normalize } from '../src/sidepanel/state/settings.js';
import { useConversations } from '../src/sidepanel/state/conversations.js';

const data = {
  source: { grid: 'list10', caption: 'Variation Data', tab: 'Variants', page: 'View 1 - 3 of 3' },
  columns: ['Chr', 'Start', 'Sample', 'HGNC'],
  rows: [
    { Chr: '1', Start: '100', Sample: 'P1', HGNC: 'A\tB' },
    { Chr: '2', Start: '200', Sample: 'P2', HGNC: 'C' },
    { Chr: '3', Start: '300', Sample: 'P3', HGNC: 'D' },
  ],
};

describe('buildAttachment', () => {
  it('TSV üretir, sekmeleri kaçırır ve tanımlayıcı sütunları çıkarır', () => {
    expect(identifierColumns(data.columns)).toEqual(['Sample']);
    expect(identifierColumns(['A:PRID946:SID23491:AID116383:NA12878', 'HGNC', 'Sample1', 'Owner'])).toEqual([
      'A:PRID946:SID23491:AID116383:NA12878',
      'Sample1',
      'Owner',
    ]);
    const a = buildAttachment(data, { maxChars: 10_000, excludeColumns: ['Sample'] });
    expect(a.columns).toEqual(['Chr', 'Start', 'HGNC']);
    expect(a.text).toContain('Chr\tStart\tHGNC');
    expect(a.text).toContain('1\t100\tA B');
    expect(a.text).not.toContain('P1');
    expect(a.includedRows).toBe(3);
  });

  it('boyut sınırında satırları kırpar ve not düşer', () => {
    const header = buildAttachment({ ...data, rows: [] }, { maxChars: 10_000 }).text.length;
    const a = buildAttachment(data, { maxChars: header + 20 });
    expect(a.includedRows).toBe(1);
    expect(a.text).toMatch(/only the first 1 of 3 rows/);
  });
});

describe('SafeMarkdown', () => {
  it('ham HTML, script ve javascript: linklerini render etmez', () => {
    const md = [
      '**kalın** <script>window.__x=1</script> <img src=x onerror="window.__y=1">',
      '[kötü](javascript:alert(1)) [iyi](https://www.ncbi.nlm.nih.gov/clinvar/)',
      '![izleme](https://evil.example/p.png)',
      '| a | b |\n|---|---|\n| 1 | 2 |',
    ].join('\n\n');
    const { container } = render(<SafeMarkdown text={md} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('strong').textContent).toBe('kalın');
    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://www.ncbi.nlm.nih.gov/clinvar/');
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(container.textContent).toContain('[image: izleme]');
    expect(container.querySelector('table')).not.toBeNull();
    expect(window.__x).toBeUndefined();
    expect(window.__y).toBeUndefined();
  });

  it('【url】 biçimindeki kaynakları bağlantıya çevirir, javascript: çevrilmez', () => {
    expect(linkifyCitations('Benign【https://www.ncbi.nlm.nih.gov/clinvar/RCV1】.')).toBe(
      'Benign [ncbi.nlm.nih.gov](https://www.ncbi.nlm.nih.gov/clinvar/RCV1).',
    );
    expect(linkifyCitations('x【javascript:alert(1)】')).toBe('x【javascript:alert(1)】');
  });
});

// --- Sohbet ekranı (sahte service worker bağlantısıyla) -----------------------------

let ports;
let hasKey;

function fakePort() {
  const onMsg = [];
  return {
    posted: [],
    postMessage(m) {
      this.posted.push(m);
    },
    onMessage: { addListener: (f) => onMsg.push(f) },
    onDisconnect: { addListener: () => {} },
    disconnect() {},
    emit: (m) => act(() => onMsg.forEach((f) => f(m))),
  };
}

beforeEach(() => {
  ports = [];
  hasKey = true;
  // Hemen çalıştırır ve 0 döner: bir sonraki olay da yeniden çizim isteyebilsin.
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    cb();
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('chrome', {
    runtime: {
      connect: () => {
        const p = fakePort();
        ports.push(p);
        return p;
      },
      sendMessage: async (m) => (m.type === MSG.GET_KEY_STATUS ? { ok: true, hasKey } : { ok: true }),
    },
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness({ onOpenSettings = () => {} }) {
  const store = useConversations(false);
  return (
    <ChatView
      settings={normalize({ allowAiData: true })}
      update={async () => {}}
      store={store}
      pendingData={null}
      setPendingData={() => {}}
      active
      onOpenSettings={onOpenSettings}
    />
  );
}

async function sendMessage(text) {
  const input = await screen.findByLabelText('Message');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByText('Send'));
  return ports.at(-1);
}

describe('ChatView ve agent', () => {
  it('yalnızca yeni mesajı konuşma kimliğiyle gönderir', async () => {
    render(<Harness />);
    const port = await sendMessage('What does PEX10 do?');
    expect(port.posted).toEqual([
      { type: 'start', threadId: expect.stringMatching(/^[0-9a-f-]{36}$/), message: 'What does PEX10 do?', attachment: null },
    ]);
  });

  it('arama adımlarını, cevabı ve kaynakları gösterir', async () => {
    render(<Harness />);
    const port = await sendMessage('ClinVar class of BRCA2 p.Asn372His?');
    port.emit({ type: 'tool_start', query: 'BRCA2 p.Asn372His ClinVar' });
    port.emit({ type: 'tool_result', sources: [{ title: 'ClinVar - NCBI', url: 'https://www.ncbi.nlm.nih.gov/clinvar/' }] });
    port.emit({ type: 'token', text: 'It is ' });
    port.emit({ type: 'token', text: '**Benign**.' });
    port.emit({ type: 'done' });

    expect(screen.getByText('BRCA2 p.Asn372His ClinVar')).toBeTruthy();
    expect(screen.getByText('Benign').tagName).toBe('STRONG');
    expect(screen.getByText('Sources (1)')).toBeTruthy();
    expect(screen.getByText('ClinVar - NCBI').getAttribute('href')).toBe('https://www.ncbi.nlm.nih.gov/clinvar/');
  });

  it('soru kartı: seçeneğe basınca o metin aynı konuşmaya cevap olarak gider', async () => {
    render(<Harness />);
    const first = await sendMessage('Which variant matters for my patient?');
    first.emit({ type: 'question', question: 'Which condition?', options: ['Zellweger syndrome', 'Breast cancer'] });
    first.emit({ type: 'done' });

    expect(screen.getByText('Which condition?')).toBeTruthy();
    expect(screen.getByLabelText('Message').placeholder).toBe('Type your answer…');
    fireEvent.click(screen.getByText('Zellweger syndrome'));

    const second = ports.at(-1);
    expect(second).not.toBe(first);
    expect(second.posted[0]).toMatchObject({ message: 'Zellweger syndrome', threadId: first.posted[0].threadId });
  });

  it('model düşünürken "Thinking…" gösterir, cevap gelince kaybolur', async () => {
    render(<Harness />);
    const port = await sendMessage('Which variant matters?');
    port.emit({ type: 'status', state: 'thinking' });
    expect(screen.getByText('Thinking…')).toBeTruthy();
    port.emit({ type: 'token', text: 'PEX10.' });
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  it('hata kodunu okunur metne çevirir ve tekrar deneme sunar', async () => {
    render(<Harness />);
    const port = await sendMessage('hi');
    port.emit({ type: 'error', error: 'RATE_LIMIT' });
    expect(screen.getByText(/per-minute limit reached/)).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(ports.at(-1).posted[0]).toMatchObject({ message: 'hi' });
  });

  it('erişim anahtarı yoksa uyarır ve gönderimi kapatır', async () => {
    hasKey = false;
    const onOpenSettings = vi.fn();
    render(<Harness onOpenSettings={onOpenSettings} />);
    await screen.findByText(/needs an access key/);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hi' } });
    expect(screen.getByText('Send').disabled).toBe(true);
    fireEvent.click(screen.getByText('Add it in Settings'));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('ilk olay gecikirse "Server is waking up…" gösterir', async () => {
    render(<Harness />);
    const input = await screen.findByLabelText('Message');
    vi.useFakeTimers();
    try {
      fireEvent.change(input, { target: { value: 'hi' } });
      fireEvent.click(screen.getByText('Send'));
      const port = ports.at(-1);
      act(() => vi.advanceTimersByTime(3100));
      expect(screen.getByText('Server is waking up…')).toBeTruthy();
      port.emit({ type: 'token', text: 'Hello' });
      expect(screen.queryByText('Server is waking up…')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
