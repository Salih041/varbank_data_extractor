// Tüm sayısal sınırlar tek yerde. Ayarlar ekranı yalnızca USER_ADJUSTABLE değerlerini değiştirebilir.

export const LIMITS = Object.freeze({
  // Çıkarma
  MAX_EXTRACT_ROWS: 1000,
  MAX_CELL_CHARS: 500,
  MAX_COLUMNS: 100,
  MAX_HEADER_CHARS: 80,

  // AI'ya gönderim
  DEFAULT_MAX_ATTACHMENT_CHARS: 40_000,
  MIN_MAX_ATTACHMENT_CHARS: 2_000,
  HARD_MAX_ATTACHMENT_CHARS: 120_000,
  MAX_USER_MESSAGE_CHARS: 8_000,
  // Model bağlamından bağımsız, istemci tarafı toplam istek tavanı (karakter)
  MAX_REQUEST_CHARS: 200_000,
  DEFAULT_CONTEXT_TOKENS: 32_000,
  RESPONSE_TOKEN_RESERVE: 2_048,
  DEFAULT_MAX_COMPLETION_TOKENS: 2_048,

  // Depolama
  MAX_CONVERSATIONS: 50,
  MAX_STORED_ATTACHMENT_CHARS: 60_000,
});

export function clampAttachmentChars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return LIMITS.DEFAULT_MAX_ATTACHMENT_CHARS;
  return Math.min(LIMITS.HARD_MAX_ATTACHMENT_CHARS, Math.max(LIMITS.MIN_MAX_ATTACHMENT_CHARS, Math.round(n)));
}
