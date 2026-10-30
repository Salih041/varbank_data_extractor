// Agent sunucusu istemcisi: SSE ayrıştırma, olay doğrulama, hata kodları ve gönderilen başlıklar.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, checkAccessKey, parseEvent, streamAgentChat } from '../src/background/agentClient.js';

const THREAD = '6f1c2a4e-8b7d-4e1a-9c3f-2d5e7a9b1c0d';
const INSTALL = '0b5e8c1d-2f4a-4c3b-9d7e-6a1f2e3d4c5b';

// Sunucu cevabını verilen parçalara bölerek akıtan sahte fetch.
function mockStream(chunks, status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mockJson(status, json) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

async function collect(chunks) {
  mockStream(chunks);
  const events = [];
  await streamAgentChat({
    accessKey: 'test-access-key-123',
    installId: INSTALL,
    threadId: THREAD,
    message: 'hi',
    onEvent: (e) => events.push(e),
  });
  return events;
}

describe('parseEvent', () => {
  it('bilinen olayları çevirir', () => {
    expect(parseEvent('event: token\ndata: {"text": "PEX"}')).toEqual({ type: 'token', text: 'PEX' });
    expect(parseEvent('event: done\ndata: {}')).toEqual({ type: 'done' });
    expect(parseEvent('event: tool_start\ndata: {"tool": "web_search", "query": "BRCA2"}')).toEqual({
      type: 'tool_start',
      query: 'BRCA2',
    });
  });

  it('bilinmeyen veya bozuk olayları atar', () => {
    expect(parseEvent('event: hack\ndata: {"x": 1}')).toBeNull();
    expect(parseEvent('event: token\ndata: {bozuk')).toBeNull();
    expect(parseEvent('data: {"text": "olay adı yok"}')).toBeNull();
  });

  it('kaynaklarda yalnızca http(s) bağlantıları bırakır', () => {
    const block =
      'event: tool_result\ndata: ' +
      JSON.stringify({
        sources: [
          { title: 'NCBI', url: 'https://www.ncbi.nlm.nih.gov/gene/5192' },
          { title: 'Kötü', url: 'javascript:alert(1)' },
        ],
      });
    expect(parseEvent(block)).toEqual({
      type: 'tool_result',
      sources: [{ title: 'NCBI', url: 'https://www.ncbi.nlm.nih.gov/gene/5192' }],
    });
  });

  it('soru seçeneklerini 4 ile sınırlar, hata kodunu doğrular', () => {
    const q = parseEvent(
      'event: question\ndata: ' + JSON.stringify({ question: 'Which disease?', options: ['a', 'b', 'c', 'd', 'e'] }),
    );
    expect(q).toEqual({ type: 'question', question: 'Which disease?', options: ['a', 'b', 'c', 'd'] });
    expect(parseEvent('event: error\ndata: {"code": "<script>"}')).toEqual({ type: 'error', error: 'SERVER', retryAfter: null });
    expect(parseEvent('event: error\ndata: {"code": "RATE_LIMIT", "retry_after": 12}')).toEqual({
      type: 'error',
      error: 'RATE_LIMIT',
      retryAfter: 12,
    });
  });
});

describe('streamAgentChat', () => {
  it('parçalara bölünmüş olayları doğru birleştirir', async () => {
    const events = await collect([
      'event: tool_start\ndata: {"tool": "web_search", "query": "BR',
      'CA2"}\n\nevent: token\ndata: {"text": "Be"}\n\nevent: tok',
      'en\ndata: {"text": "nign"}\n\nevent: done\ndata: {}\n\n',
    ]);
    expect(events).toEqual([
      { type: 'tool_start', query: 'BRCA2' },
      { type: 'token', text: 'Be' },
      { type: 'token', text: 'nign' },
      { type: 'done' },
    ]);
  });

  it('anahtarı ve kurulum kimliğini başlıkta, mesajı gövdede gönderir', async () => {
    const fetchMock = mockStream(['event: done\ndata: {}\n\n']);
    await streamAgentChat({
      accessKey: 'test-access-key-123',
      installId: INSTALL,
      threadId: THREAD,
      message: 'hi',
      attachment: 'Gene\tCADD',
      onEvent: () => {},
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/chat');
    expect(init.headers.Authorization).toBe('Bearer test-access-key-123');
    expect(init.headers['X-Install-Id']).toBe(INSTALL);
    expect(JSON.parse(init.body)).toEqual({ thread_id: THREAD, message: 'hi', attachment: 'Gene\tCADD' });
    expect(init.credentials).toBe('omit');
  });

  it('anahtar yoksa istek atmaz', async () => {
    const fetchMock = mockStream([]);
    await expect(streamAgentChat({ accessKey: null, threadId: THREAD, message: 'hi' })).rejects.toMatchObject({
      code: 'NO_ACCESS_KEY',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('hata kodları', () => {
  it.each([
    [401, { detail: 'BAD_ACCESS_KEY' }, 'BAD_ACCESS_KEY'],
    [429, { detail: 'RATE_LIMIT' }, 'RATE_LIMIT'],
    [429, { detail: 'TOO_MANY_ATTEMPTS' }, 'TOO_MANY_ATTEMPTS'],
    [413, { detail: 'TOO_LARGE' }, 'TOO_LARGE'],
    [500, {}, 'SERVER'],
    [422, {}, 'BAD_REQUEST'],
  ])('%s → %s', async (status, json, code) => {
    mockJson(status, json);
    const err = await checkAccessKey({ accessKey: 'test-access-key-123' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe(code);
  });

  it('sunucuya ulaşılamazsa NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await checkAccessKey({ accessKey: 'test-access-key-123' }).catch((e) => e);
    expect(err.code).toBe('NETWORK');
  });
});
