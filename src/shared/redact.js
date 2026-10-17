// Hata/log metinlerinden gizli bilgileri temizler. Kullanıcıya gösterilen veya
// konsola yazılan her hata metni buradan geçer.

const PATTERNS = [
  [/gsk_[A-Za-z0-9]{8,}/g, 'gsk_***'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ***'],
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, '$1-***'],
  [/("?(api[_-]?key|authorization|token|password)"?\s*[:=]\s*)("[^"]*"|[^\s,}]+)/gi, '$1"***"'],
];

export function redact(text, maxChars = 300) {
  let s = String(text ?? '');
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  if (s.length > maxChars) s = s.slice(0, maxChars) + '…';
  return s;
}
