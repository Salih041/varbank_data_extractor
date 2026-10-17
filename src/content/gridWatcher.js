// Grid değişikliklerini (yükleme, satır seçimi, sekme geçişi) izler ve onChange'i debounce'lu çağırır.
//
// Önemli: Varbank, "Show variations" ile Variants grid'ini (gbox_list10) tamamen YENİ DOM
// öğeleriyle değiştirir. Bu yüzden tek tek grid kutuları değil, sabit sayfa kökü izlenir ve
// yalnızca ilgili mutasyonlar (grid içi, sekme paneli, grid ekleme/kaldırma) dikkate alınır.
// Tooltip (overlib) gibi alakasız DOM değişiklikleri atlanır.

const ATTRS = ['class', 'aria-selected', 'style', 'aria-hidden'];

function containsGrid(node) {
  return node.nodeType === 1 && (node.matches('.ui-jqgrid') || !!node.querySelector('.ui-jqgrid'));
}

export function isRelevantMutation(m) {
  const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
  if (!el) return false;
  if (el.closest('.ui-jqgrid')) return true;
  if (m.type === 'attributes') return /^tabs-\d+$/.test(el.id);
  for (const n of m.addedNodes) if (containsGrid(n)) return true;
  for (const n of m.removedNodes) if (containsGrid(n)) return true;
  return false;
}

/**
 * @param {Node} root          izlenecek sabit kök (ör. document.body)
 * @param {() => void} onChange ilgili değişiklikten `delay` ms sonra bir kez çağrılır
 * @returns {() => void}       izlemeyi durdurur
 */
export function watchGrids(root, onChange, delay = 300) {
  let timer = null;
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some(isRelevantMutation)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, delay);
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS });
  return () => {
    observer.disconnect();
    if (timer) clearTimeout(timer);
  };
}
