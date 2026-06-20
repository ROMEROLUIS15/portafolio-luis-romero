/* ============================================
   NAVIGATION — mobile toggle
   ============================================ */
function myMenuFunction() {
  const menu = document.getElementById('myNavMenu');
  menu.classList.toggle('responsive');
}

/* ============================================
   NAV — shrink on scroll + active link
   ============================================ */
const header = document.getElementById('header');

window.addEventListener('scroll', () => {
  // shrink nav
  if (window.scrollY > 50) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }

  // back-to-top visibility
  const btt = document.getElementById('backToTop');
  if (btt) {
    btt.classList.toggle('visible', window.scrollY > 400);
  }

  // active nav link
  updateActiveLink();
});

function updateActiveLink() {
  const sections = document.querySelectorAll('section[id]');
  const scrollY = window.scrollY + 100;
  sections.forEach(section => {
    const top = section.offsetTop;
    const height = section.offsetHeight;
    const id = section.getAttribute('id');
    const link = document.querySelector(`.nav-menu a[href="#${id}"]`);
    if (link) {
      link.classList.toggle('active-link', scrollY >= top && scrollY < top + height);
    }
  });
}

/* ============================================
   DARK MODE TOGGLE
   ============================================ */
const darkToggle = document.getElementById('darkToggle');

function applyTheme(isDark) {
  document.body.classList.toggle('dark', isDark);
  if (darkToggle) {
    darkToggle.innerHTML = isDark
      ? '<i class="uil uil-sun"></i>'
      : '<i class="uil uil-moon"></i>';
  }
  localStorage.setItem('dark-mode', isDark ? 'true' : 'false');
}

// Init theme
const savedTheme = localStorage.getItem('dark-mode');
applyTheme(savedTheme !== 'false'); // dark by default

if (darkToggle) {
  darkToggle.addEventListener('click', () => {
    applyTheme(!document.body.classList.contains('dark'));
  });
}

/* ============================================
   LANGUAGE TOGGLE
   ============================================ */
function goToSpanish() {
  window.location.href = 'spanish/index.html';
}
function goToEnglish() {
  window.location.href = '../index.html';
}

/* ============================================
   TYPED.JS
   ============================================ */
if (document.querySelector('.typedText')) {
  const isSpanish = document.documentElement.lang === 'es';
  new Typed('.typedText', {
    strings: isSpanish
      ? ['AI Engineer', 'Desarrollador Backend', 'Node.js / TypeScript']
      : ['AI Engineer', 'Backend Developer', 'Node.js / TypeScript'],
    loop: true,
    typeSpeed: 80,
    backSpeed: 50,
    backDelay: 2200,
  });
}

/* ============================================
   SCROLL REVEAL — custom lightweight
   ============================================ */
function initReveal() {
  const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // stagger siblings inside same parent
        const siblings = Array.from(entry.target.parentElement.querySelectorAll('.reveal, .reveal-left, .reveal-right'));
        const idx = siblings.indexOf(entry.target);
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, idx * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  els.forEach(el => observer.observe(el));
}

document.addEventListener('DOMContentLoaded', initReveal);

/* ============================================
   CLOSE MOBILE MENU ON LINK CLICK OR OUTSIDE TAP
   ============================================ */
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    const menu = document.getElementById('myNavMenu');
    if (menu) menu.classList.remove('responsive');
  });
});

// Close on tap/click outside the nav
document.addEventListener('click', (e) => {
  const menu = document.getElementById('myNavMenu');
  const nav  = document.getElementById('header');
  if (menu && menu.classList.contains('responsive') && !nav.contains(e.target)) {
    menu.classList.remove('responsive');
  }
});

/* ============================================
   CV MODAL TOGGLE
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  const cvBtn     = document.querySelector('.cv-dropdown-btn');
  const cvModal   = document.getElementById('cvModal');
  const cvOverlay = document.getElementById('cvOverlay');

  if (!cvBtn || !cvModal || !cvOverlay) return;

  function openCV() {
    cvModal.classList.add('open');
    cvOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCV() {
    cvModal.classList.remove('open');
    cvOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Open on button click
  cvBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openCV();
  });

  // Close when clicking the overlay
  cvOverlay.addEventListener('click', closeCV);

  // Close with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCV();
  });

  // Close after selecting a CV (download starts, modal closes)
  cvModal.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeCV);
  });
});
