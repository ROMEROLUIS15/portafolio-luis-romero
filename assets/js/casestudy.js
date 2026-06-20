/* ============================================
   CASE STUDY DRAWER — vanilla JS
   ============================================ */
(function () {
  const lang = document.documentElement.lang === 'es' ? 'es' : 'en';

  /* ---------- DRAWER OPEN / CLOSE ---------- */
  function openDrawer() {
    document.getElementById('csOverlay').classList.add('open');
    document.getElementById('csDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    document.getElementById('csOverlay').classList.remove('open');
    document.getElementById('csDrawer').classList.remove('open');
    document.body.style.overflow = '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn     = document.getElementById('csCronixBtn');
    const overlay = document.getElementById('csOverlay');
    const closeBtn = document.getElementById('csClose');

    if (!btn || !overlay || !closeBtn) return;

    btn.addEventListener('click', openDrawer);
    overlay.addEventListener('click', closeDrawer);
    closeBtn.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });
  });
})();
