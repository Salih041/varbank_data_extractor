// Model çıktısı güvenilmeyen içeriktir. react-markdown ham HTML'i render ETMEZ
// (rehype-raw kullanılmıyor), ek olarak:
//   - skipHtml: metindeki HTML etiketleri tamamen atlanır
//   - yalnızca http/https linkler; diğer şemalar (javascript:, data:, chrome-extension:) boş
//   - resimler yüklenmez (izleme pikseli / veri sızdırma önlemi), alt metin gösterilir
//   - dangerouslySetInnerHTML hiçbir yerde kullanılmaz

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const safeUrl = (url) => (typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url : '');

// Bazı modeller kaynakları 【https://…】 biçiminde yazıyor; bunları normal bağlantıya çevirir.
// Bağlantının metni sitenin adı olur (ör. "ncbi.nlm.nih.gov"). Asıl güvenlik yine safeUrl'de.
export function linkifyCitations(text) {
  return text.replace(/【\s*(https?:\/\/[^\s】]+)\s*】/g, (_, url) => {
    let host = 'source';
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // geçersiz adres: "source" kalır
    }
    return ` [${host}](${url})`;
  });
}

const components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt }) => <span className="img-alt">[image: {alt || 'untitled'}]</span>,
};

export default function SafeMarkdown({ text }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeUrl} components={components}>
      {linkifyCitations(text)}
    </Markdown>
  );
}
