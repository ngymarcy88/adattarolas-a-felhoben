export function mountModal(dialog: HTMLDialogElement, initialFocus: HTMLElement): () => void {
  const body = dialog.ownerDocument.body; const overflow = body.style.overflow;
  if (!dialog.open) dialog.showModal(); body.style.overflow = 'hidden'; initialFocus.focus();
  return () => { if (dialog.open) dialog.close(); body.style.overflow = overflow; };
}
export function restoreModalFocus(opener: HTMLElement | null, fallback: HTMLElement | null) {
  const target = opener?.isConnected ? opener : fallback?.isConnected ? fallback : null;
  target?.focus();
}
export function observeVisible(element: Element, onVisible: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {}; // Explicit click still works.
  let seen = false;
  const observer = new IntersectionObserver(entries => {
    if (!seen && entries.some(entry => entry.isIntersecting)) { seen = true; observer.disconnect(); onVisible(); }
  }, { rootMargin: '0px', threshold: 0 });
  observer.observe(element); return () => observer.disconnect();
}
