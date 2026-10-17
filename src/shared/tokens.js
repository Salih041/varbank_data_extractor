// Kaba token tahmini. Gerçek tokenizer kullanmadan bütçe hesabı için yeterli
// (Latin metin ≈ 4 karakter/token; sayı ve semboller daha yoğun olduğu için 3.5).

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 3.5);
}

export function formatTokens(n) {
  if (n < 1000) return String(n);
  return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + 'k';
}
