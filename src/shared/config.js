// Sabit yapılandırma. Sunucu adresi kullanıcı tarafından değiştirilemez; build sırasında
// manifest'teki host_permissions ve CSP connect-src ile birlikte ayarlanır.

import { LIMITS } from './limits.js';

export const VARBANK_HOST = 'varbank.ccg.uni-koeln.de';
export const VARBANK_PATH_PREFIX = '/varbank2/';
export const VARBANK_URL_PREFIX = `https://${VARBANK_HOST}${VARBANK_PATH_PREFIX}`;

// Agent sunucusu (server/). Build sırasında AGENT_URL ile verilir (vite.config.js);
// verilmezse (geliştirme, testler) yerel sunucu.
/* global __AGENT_BASE_URL__ */
export const AGENT_BASE_URL = typeof __AGENT_BASE_URL__ === 'string' ? __AGENT_BASE_URL__ : 'http://localhost:8000';

// Model ve temperature artık sunucuda seçiliyor; burada yalnızca panelin kendi ayarları var.
export const DEFAULT_SETTINGS = Object.freeze({
  maxAttachmentChars: LIMITS.DEFAULT_MAX_ATTACHMENT_CHARS,
  allowAiData: false, // Tablo verisinin AI'ya gönderimi: varsayılan KAPALI
  askEveryTime: true, // Her veri gönderiminde onay sor
  saveHistory: true,
  keyStorage: 'local', // erişim anahtarı: 'local' | 'session'
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
