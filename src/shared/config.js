// Sabit yapılandırma. API adresi bilerek ayarlanabilir değildir: manifest CSP'si
// (connect-src) ve host_permissions ile birlikte değişmesi gerekir. Proxy'ye geçişte bu adres,
// manifest'teki host_permissions ve CSP connect-src birlikte güncellenir.

export const VARBANK_HOST = 'varbank.ccg.uni-koeln.de';
export const VARBANK_PATH_PREFIX = '/varbank2/';
export const VARBANK_URL_PREFIX = `https://${VARBANK_HOST}${VARBANK_PATH_PREFIX}`;
export const API_BASE_URL = 'https://api.groq.com/openai/v1';

// /models listesi alınamazsa kullanılacak varsayılan. Mevcut değilse listeden ilk sohbet modeli seçilir.
export const FALLBACK_MODEL = 'llama-3.3-70b-versatile';

// Sohbet için uygun olmayan modelleri listeden çıkar (ses, TTS, güvenlik sınıflandırıcıları).
export const NON_CHAT_MODEL_RE = /whisper|tts|guard|playai|orpheus|distil|safeguard/i;

export const DEFAULT_SETTINGS = Object.freeze({
  model: FALLBACK_MODEL,
  temperature: 0.3,
  maxAttachmentChars: 40_000,
  allowAiData: false, // Tablo verisinin AI'ya gönderimi: varsayılan KAPALI
  askEveryTime: true, // Her veri gönderiminde onay sor
  saveHistory: true,
  keyStorage: 'local', // 'local' | 'session'
  textSize: 'md', // TEXT_SIZES anahtarlarından biri
});

// Panelin yazı boyutu ön ayarları (kök font-size, px). Tüm stiller rem cinsinden olduğu için
// düzen bu değerle orantılı ölçeklenir. Sıra önemlidir: A−/A+ bu sırayla gezinir.
export const TEXT_SIZES = Object.freeze([
  { id: 'sm', label: 'Small', short: 'S', px: 12 },
  { id: 'md', label: 'Default', short: 'M', px: 13.5 },
  { id: 'lg', label: 'Large', short: 'L', px: 15 },
  { id: 'xl', label: 'X-Large', short: 'XL', px: 16.5 },
  { id: 'xxl', label: 'XX-Large', short: 'XXL', px: 18 },
]);

export const textSizeOf = (id) => TEXT_SIZES.find((t) => t.id === id) || TEXT_SIZES.find((t) => t.id === 'md');

export const isVarbankUrl = (url) => typeof url === 'string' && url.startsWith(VARBANK_URL_PREFIX);
