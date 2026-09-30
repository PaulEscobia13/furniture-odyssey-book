const dialog = document.querySelector('#focus-dialog');
const motionButtons = document.querySelectorAll('[data-motion]');
let paused = false, lastFocus, readerActive = false, busy = false, opening = false, spread = 0, navFocus;
function showView(open = false, source = document.activeElement) {
  lastFocus = source;
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('modal-open');
  if (open) openBook();
}
function openBook() {
  if (readerActive) return;
  readerActive = true; opening = true; spread = 0;
  dialog.classList.add('reading');
  document.querySelector('.reader-controls').hidden = false;
  document.querySelector('.reader-note').hidden = false;
  document.dispatchEvent(new CustomEvent('book-reader-state', { detail: { open: true, spread: 0 } }));
  updateNavigation();
}
async function closeBook(closeView = false) {
  if (readerActive) {
    readerActive = false; opening = false;
    document.dispatchEvent(new CustomEvent('book-reader-state', { detail: { open: false } }));
    dialog.classList.remove('reading', 'pages-ready');
    document.querySelector('.reader-controls').hidden = true;
    document.querySelector('.reader-note').hidden = true;
    document.querySelector('.mobile-reading').hidden = true;
    if (closeView && !matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 950));
  }
  if (closeView && dialog.open) dialog.close();
}
document.querySelectorAll('[data-focus]').forEach(button => button.addEventListener('click', () => showView(false, button)));
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => showView(true, button)));
document.querySelectorAll('[data-viewer]').forEach(host => {
  host.addEventListener('click', () => { if (!host.classList.contains('is-3d')) showView(true, host); });
  host.addEventListener('keydown', event => { if (!host.classList.contains('is-3d') && event.key === 'Enter') showView(true, host); });
});
document.addEventListener('book-open-request', event => showView(true, event.detail?.host));
document.querySelector('.close-button').addEventListener('click', () => closeBook(true));
document.querySelector('[data-close-book]').addEventListener('click', () => closeBook());
dialog.addEventListener('cancel', event => { event.preventDefault(); closeBook(true); });
dialog.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  readerActive = false;
  document.dispatchEvent(new CustomEvent('book-reader-state', { detail: { open: false } }));
  dialog.classList.remove('reading', 'pages-ready');
  lastFocus?.focus();
});
function updateNavigation() {
  document.querySelector('[data-page="back"]').disabled = spread === 0 || busy || opening;
  document.querySelector('[data-page="next"]').disabled = spread === 2 || busy || opening;
  document.querySelector('.page-status').textContent = 'Pages ' + (spread * 2 + 1) + '–' + (spread * 2 + 2) + ' of 6';
}
function turnPage(direction) {
  if (!readerActive || busy || opening || spread + direction < 0 || spread + direction > 2) return;
  navFocus = document.activeElement?.hasAttribute('data-page') ? document.activeElement : null;
  busy = true; spread += direction; updateNavigation();
  document.dispatchEvent(new CustomEvent('book-turn-page', { detail: { spread, direction } }));
}
document.querySelector('[data-page="next"]').addEventListener('click', () => turnPage(1));
document.querySelector('[data-page="back"]').addEventListener('click', () => turnPage(-1));
document.addEventListener('book-turn-complete', () => {
  busy = false; updateNavigation();
  if (readerActive && navFocus) {
    const control = navFocus.disabled ? document.querySelector('[data-page="' + (spread === 2 ? 'back' : 'next') + '"]') : navFocus;
    control.focus({ preventScroll: true });
  }
});
document.addEventListener('book-reader-ready', () => { opening = false; updateNavigation(); });
dialog.addEventListener('keydown', event => {
  if (!readerActive || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
  event.preventDefault(); turnPage(event.key === 'ArrowRight' ? 1 : -1);
});
motionButtons.forEach(button => button.addEventListener('click', () => {
  paused = !paused; document.body.classList.toggle('paused', paused);
  motionButtons.forEach(control => {
    control.setAttribute('aria-pressed', String(paused));
    control.querySelector('[data-motion-label]').textContent = paused ? 'Resume motion' : 'Pause motion';
    control.querySelector('.motion-icon').textContent = paused ? '▷' : 'Ⅱ';
  });
}));

