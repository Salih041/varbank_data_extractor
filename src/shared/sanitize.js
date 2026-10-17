// Sayfadan gelen her metin güvenilmeyen veridir. Burada yalnızca düz metne indirgenir;
// HTML olarak yorumlanmaz, çalıştırılmaz.

import { LIMITS } from './limits.js';

// C0/C1 kontrol karakterleri (\t ve \n hariç), sıfır genişlikli ve yön değiştiren karakterler.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function cleanText(value, maxChars = LIMITS.MAX_CELL_CHARS) {
  if (value == null) return '';
  let s = String(value).replace(CONTROL_RE, '').replace(/ /g, ' ');
  s = s.replace(/[ \t\r\n]+/g, ' ').trim();
  if (s.length > maxChars) s = s.slice(0, maxChars) + '…';
  return s;
}

// Yalnızca http/https mutlak URL'ler kabul edilir. javascript:, data:, vb. atılır.
export function safeHttpUrl(href, base) {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    const url = new URL(href.trim(), base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    const out = url.toString();
    return out.length > 2000 ? null : out;
  } catch {
    return null;
  }
}

export function safeFileName(name) {
  return String(name).replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 100) || 'export';
}
