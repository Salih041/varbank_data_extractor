// Agent sunucusu istemcisi. Yalnızca service worker'da kullanılır; erişim anahtarı
// panele veya content script'e hiçbir zaman verilmez.

import { AGENT_BASE_URL } from '../shared/config.js';
import { cleanText, safeHttpUrl } from '../shared/sanitize.js';

export class ApiError extends Error {
  constructor(code, { retryAfter = null } = {}) {
    // Mesaja yanıt gövdesi, anahtar veya kullanıcı verisi KONULMAZ.
    super(code);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

async function errorFromResponse(res) {
  let detail = '';
  try {
    detail = String((await res.json())?.detail || '');
  } catch {
    // gövde okunamadı; önemli değil
  }
  if (res.status === 401) return new ApiError('BAD_ACCESS_KEY');
  if (res.status === 429) return new ApiError(detail === 'TOO_MANY_ATTEMPTS' ? 'TOO_MANY_ATTEMPTS' : 'RATE_LIMIT');
  if (res.status === 413) return new ApiError('TOO_LARGE');
  if (res.status >= 500) return new ApiError('SERVER');
  return new ApiError('BAD_REQUEST');
}

async function request(method, path, { accessKey, installId, body, signal }) {
  if (!accessKey) throw new ApiError('NO_ACCESS_KEY');
  const headers = { Authorization: `Bearer ${accessKey}` };
  if (installId) headers['X-Install-Id'] = installId;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${AGENT_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch (e) {
    throw new ApiError(e?.name === 'AbortError' ? 'ABORTED' : 'NETWORK');
  }
  if (!res.ok) throw await errorFromResponse(res);
  return res;
}

export async function checkAccessKey({ accessKey }) {
  await request('GET', '/auth/check', { accessKey });
}

export async function deleteThread({ accessKey, installId, threadId }) {
  await request('DELETE', `/threads/${encodeURIComponent(threadId)}`, { accessKey, installId });
}

// Sunucudan gelen olaylar da doğrulanır: yalnızca bilinen türler ve beklenen alanlar panele geçer.
const MAX_SOURCES = 10;
const MAX_OPTIONS = 4;

function cleanEvent(type, data) {
  switch (type) {
    case 'token':
      return typeof data.text === 'string' ? { type, text: data.text } : null;
    case 'tool_start':
      return { type, query: cleanText(data.query, 200) };
    case 'tool_result': {
      const sources = (Array.isArray(data.sources) ? data.sources : [])
        .map((s) => ({ title: cleanText(s?.title, 200), url: safeHttpUrl(s?.url) }))
        .filter((s) => s.url)
        .slice(0, MAX_SOURCES);
      return { type, sources };
    }
    case 'question': {
      const options = (Array.isArray(data.options) ? data.options : [])
        .map((o) => cleanText(o, 80))
        .filter(Boolean)
        .slice(0, MAX_OPTIONS);
      const question = cleanText(data.question, 300);
      return question ? { type, question, options } : null;
    }
    case 'done':
      return { type };
    case 'error': {
      const seconds = Number(data.retry_after);
      return {
        type,
        error: /^[A-Z_]{1,40}$/.test(data.code) ? data.code : 'SERVER',
        retryAfter: seconds >= 1 && seconds <= 120 ? Math.round(seconds) : null,
      };
    }
    default:
      return null;
  }
}

// Tek bir SSE bloğunu ("event: ...\ndata: {...}") olaya çevirir; bozuksa null döner.
export function parseEvent(block) {
  let type = null;
  let data = null;
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) {
      try {
        data = JSON.parse(line.slice(5).trim());
      } catch {
        return null;
      }
    }
  }
  if (!type || !data || typeof data !== 'object') return null;
  return cleanEvent(type, data);
}

/**
 * Sohbet isteği gönderir; sunucudan gelen her olay için onEvent(olay) çağrılır.
 */
export async function streamAgentChat({ accessKey, installId, threadId, message, attachment, signal, onEvent }) {
  const body = { thread_id: threadId, message };
  if (attachment) body.attachment = attachment;
  const res = await request('POST', '/chat', { accessKey, installId, body, signal });
  if (!res.body) throw new ApiError('BAD_RESPONSE');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      // Olaylar boş bir satırla ayrılır. Yarım gelen olay bir sonraki parçayı bekler.
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const event = parseEvent(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (event) onEvent(event);
      }
    }
  } catch (e) {
    throw new ApiError(e?.name === 'AbortError' ? 'ABORTED' : 'NETWORK');
  }
}
