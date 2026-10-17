// Model çıktısı güvenilmeyen içeriktir. react-markdown ham HTML'i render ETMEZ
// (rehype-raw kullanılmıyor), ek olarak:
//   - skipHtml: metindeki HTML etiketleri tamamen atlanır
//   - yalnızca http/https linkler; diğer şemalar (javascript:, data:, chrome-extension:) boş
//   - resimler yüklenmez (izleme pikseli / veri sızdırma önlemi), alt metin gösterilir
//   - dangerouslySetInnerHTML hiçbir yerde kullanılmaz

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const safeUrl = (url) => (typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url : '');

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
      {text}
    </Markdown>
  );
}
