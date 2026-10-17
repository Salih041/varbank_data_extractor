// Groq (OpenAI uyumlu) istemcisi. Yalnızca service worker'da kullanılır; API anahtarı
// panel veya content script'e hiçbir zaman verilmez.

import { API_BASE_URL, NON_CHAT_MODEL_RE } from '../shared/config.js';

export class ApiError extends Error {
  /** @param {'NO_KEY'|'UNAUTHORIZED'|'RATE_LIMIT'|'TOO_LARGE'|'MODEL'|'SERVER'|'NETWORK'|'ABORTED'|'BAD_RESPONSE'|'BAD_REQUEST'} code */
  constructor(code, { status = 0, retryAfter = null } = {}) {
    // Mesaja yanıt gövdesi, anahtar veya kullanıcı verisi KONULMAZ.
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function errorFromResponse(res) {
  const retryAfter = Number(res.headers.get('retry-after')) || null;
  let apiCode = '';
  try {
    const body = await res.json();
    apiCode = String(body?.error?.code || body?.error?.type || '');
  } catch {
    // gövde okunamadı; önemli değil
  }
  if (res.status === 401 || res.status === 403) return new ApiError('UNAUTHORIZED', { status: res.status });
  if (res.status === 429) return new ApiError('RATE_LIMIT', { status: 429, retryAfter });
  if (res.status === 413 || /context_length|too_large|tokens/i.test(apiCode))
    return new ApiError('TOO_LARGE', { status: res.status });
  if (res.status === 404 || /model/i.test(apiCode)) return new ApiError('MODEL', { status: res.status });
  if (res.status >= 500) return new ApiError('SERVER', { status: res.status });
  return new ApiError('BAD_REQUEST', { status: res.status });
}

async function request(path, { apiKey, signal, body }) {
  if (!apiKey) throw new ApiError('NO_KEY');
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
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

export async function listModels({ apiKey, signal }) {
  const res = await request('/models', { apiKey, signal });
  const json = await res.json().catch(() => null);
  if (!json || !Array.isArray(json.data)) throw new ApiError('BAD_RESPONSE');
  return json.data
    .filter((m) => m && typeof m.id === 'string' && m.active !== false && !NON_CHAT_MODEL_RE.test(m.id))
    .map((m) => ({ id: m.id, contextWindow: Number(m.context_window) || null, owner: String(m.owned_by || '') }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Akışlı sohbet tamamlama. Her parça için onDelta(text), sonunda kullanım bilgisini döndürür.
 */
export async function streamChat({ apiKey, model, messages, temperature, maxTokens, signal, onDelta }) {
  const res = await request('/chat/completions', {
    apiKey,
    signal,
    body: { model, messages, temperature, max_completion_tokens: maxTokens, stream: true },
  });
  if (!res.body) throw new ApiError('BAD_RESPONSE');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;
  let finishReason = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return { usage, finishReason };
        let chunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.error) throw new ApiError('SERVER');
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content;
        if (typeof delta === 'string' && delta) onDelta(delta);
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const u = chunk.x_groq?.usage || chunk.usage;
        if (u) usage = { prompt: u.prompt_tokens, completion: u.completion_tokens, total: u.total_tokens };
      }
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e?.name === 'AbortError' ? 'ABORTED' : 'NETWORK');
  }
  return { usage, finishReason };
}
