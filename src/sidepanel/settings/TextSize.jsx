// Yazı boyutu: kök font-size'ı ayarlar (tüm stiller rem cinsinden olduğu için düzen orantılı
// ölçeklenir). Ayar chrome.storage'da saklanır; ⧉ ile açılan pencere storage.onChanged ile senkron.

import { useEffect } from 'react';
import { TEXT_SIZES, textSizeOf } from '../../shared/config.js';

export function useApplyTextSize(id) {
  useEffect(() => {
    document.documentElement.style.fontSize = `${textSizeOf(id).px}px`;
  }, [id]);
}

function step(id, delta) {
  const i = TEXT_SIZES.findIndex((t) => t.id === textSizeOf(id).id);
  return TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, i + delta))].id;
}

/** Başlık çubuğundaki hızlı küçült/büyüt düğmeleri. */
export function TextSizeStepper({ value, onChange }) {
  const current = textSizeOf(value);
  const i = TEXT_SIZES.indexOf(current);
  return (
    <>
      <button
        type="button"
        className="tool"
        disabled={i === 0}
        title={`Smaller text (now: ${current.label})`}
        aria-label="Decrease text size"
        onClick={() => onChange(step(value, -1))}
      >
        A−
      </button>
      <button
        type="button"
        className="tool"
        disabled={i === TEXT_SIZES.length - 1}
        title={`Larger text (now: ${current.label})`}
        aria-label="Increase text size"
        onClick={() => onChange(step(value, +1))}
      >
        A+
      </button>
    </>
  );
}

/** Settings → Appearance: 5 hazır boyut, her "A" kendi boyutunda gösterilir. */
export function TextSizePicker({ value, onChange }) {
  const current = textSizeOf(value).id;
  return (
    <div className="size-picker" role="radiogroup" aria-label="Text size">
      {TEXT_SIZES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={t.id === current}
          aria-label={t.label}
          title={t.label}
          onClick={() => onChange(t.id)}
        >
          <span className="sample" style={{ fontSize: `${t.px}px` }} aria-hidden="true">
            A
          </span>
          {/* Dar panelde uzun ad yerine kısa ad (S…XXL) gösterilir; erişilebilir ad her zaman tam. */}
          <span className="name long-only" aria-hidden="true">
            {t.label}
          </span>
          <span className="name short-only" aria-hidden="true">
            {t.short}
          </span>
        </button>
      ))}
    </div>
  );
}
