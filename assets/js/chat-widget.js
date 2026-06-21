/**
 * Chat Widget — Portfolio Conversational Agent
 * Vanilla JS IIFE — no dependencies
 * Requirements: 1.x, 5.x, 6.x, 7.x, 8.x
 */
(function ChatWidget() {
  'use strict';

  // ─── Config ───────────────────────────────────────────────────────────────

  const ENDPOINT =
    (typeof window !== 'undefined' && window.__CHAT_ENDPOINT__)
      ? window.__CHAT_ENDPOINT__
      : 'https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/chat';

  const MAX_MESSAGES = 20;
  const REQUEST_TIMEOUT_MS = 8000;
  const RETRY_DELAYS_MS = [1000, 2000];

  // ─── i18n ─────────────────────────────────────────────────────────────────

  const i18n = {
    en: {
      headerName: 'Luis\'s AI Assistant',
      headerStatus: 'Online',
      placeholder: 'Ask me anything about Luis…',
      welcomeMsg:
        'Hi! I\'m Luis\'s AI assistant. I can answer questions about his experience, projects, and skills. What would you like to know?',
      suggestions: [
        "What is Luis's experience with LangGraph?",
        "What are Cronix's real production metrics?",
        'What stack does Luis use for anti-hallucination systems?',
      ],
      suggestionsLabel: 'Suggested questions',
      fallback:
        'Sorry, the agent is currently unavailable. You can reach me at lueduar15@gmail.com',
      rateLimitMsg: (secs) => `Too many requests. Please wait ${secs}s before sending another message.`,
      errorInvalidMsg: 'Invalid message. Please keep it under 500 characters.',
      errorGeneric: 'Something went wrong. Please try again.',
      sendAriaLabel: 'Send message',
    },
    es: {
      headerName: 'Asistente IA de Luis',
      headerStatus: 'En línea',
      placeholder: 'Pregúntame algo sobre Luis…',
      welcomeMsg:
        '¡Hola! Soy el asistente IA de Luis. Puedo responder preguntas sobre su experiencia, proyectos y habilidades. ¿Qué te gustaría saber?',
      suggestions: [
        '¿Qué experiencia tiene Luis con LangGraph?',
        '¿Cuáles son las métricas reales de Cronix?',
        '¿Qué stack usa Luis para sistemas anti-alucinación?',
      ],
      suggestionsLabel: 'Preguntas sugeridas',
      fallback:
        'Lo siento, el agente no está disponible ahora mismo. Puedes contactarme en lueduar15@gmail.com',
      rateLimitMsg: (secs) => `Demasiadas solicitudes. Por favor espera ${secs}s antes de enviar otro mensaje.`,
      errorInvalidMsg: 'Mensaje inválido. Por favor mantenlo bajo 500 caracteres.',
      errorGeneric: 'Algo salió mal. Por favor intenta de nuevo.',
      sendAriaLabel: 'Enviar mensaje',
    },
  };

  // ─── State ────────────────────────────────────────────────────────────────

  /** @type {'es'|'en'} */
  function getLang() {
    const lang = document.documentElement.lang;
    return lang === 'es' ? 'es' : 'en';
  }

  function t(key, ...args) {
    const lang = getLang();
    const val = i18n[lang][key];
    return typeof val === 'function' ? val(...args) : val;
  }

  /** @type {{ sessionToken: string, messages: Array, isOpen: boolean, isLoading: boolean, retryCount: number, rateLimitUntil: number|null, hasHadExchange: boolean }} */
  const state = {
    sessionToken: getOrCreateSessionToken(),
    messages: [],
    isOpen: false,
    isLoading: false,
    retryCount: 0,
    rateLimitUntil: null,
    hasHadExchange: false,
    rateLimitTimer: null,
  };

  // ─── Session Token — Requirement 1.5 ────────────────────────────────────

  function generateUUIDv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 0x0f) | (c === 'x' ? 0 : 0x08);
      return r.toString(16);
    });
  }

  function getOrCreateSessionToken() {
    const stored = sessionStorage.getItem('cw_session_token');
    if (stored) return stored;
    const token = generateUUIDv4();
    sessionStorage.setItem('cw_session_token', token);
    return token;
  }

  // ─── DOM Helpers ──────────────────────────────────────────────────────────

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') node.className = v;
      else if (k === 'textContent') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const child of children) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function svgIcon(path, viewBox = '0 0 24 24') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = path;
    return svg;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString(getLang() === 'es' ? 'es-CO' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ─── Build DOM ────────────────────────────────────────────────────────────

  let bubbleBtn, panel, messagesEl, inputEl, sendBtn, suggestionsEl,
    rateLimitBar, typingEl, headerStatusEl;

  function buildWidget() {
    // ── Bubble button ────────────────────────────────────────────────────
    const iconChat = svgIcon(
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>'
    );
    iconChat.classList.add('cw-bubble-icon', 'cw-bubble-icon--chat');

    const iconClose = svgIcon(
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'
    );
    iconClose.classList.add('cw-bubble-icon', 'cw-bubble-icon--close');

    const dot = el('span', { className: 'cw-bubble-dot' });

    bubbleBtn = el(
      'button',
      {
        className: 'cw-bubble',
        'aria-label': 'Open chat assistant',
        'aria-expanded': 'false',
        onclick: togglePanel,
      },
      iconChat,
      iconClose,
      dot
    );

    // ── Panel ────────────────────────────────────────────────────────────
    // Header
    const avatarSvg = svgIcon(
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>'
    );
    const headerAvatar = el('div', { className: 'cw-header-avatar' }, avatarSvg);

    headerStatusEl = el('div', { className: 'cw-header-status', textContent: t('headerStatus') });
    const headerInfo = el(
      'div',
      { className: 'cw-header-info' },
      el('div', { className: 'cw-header-name', textContent: t('headerName') }),
      headerStatusEl
    );

    const closeSvg = svgIcon(
      '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'
    );
    const closeBtn = el(
      'button',
      { className: 'cw-close-btn', 'aria-label': 'Close chat', onclick: togglePanel },
      closeSvg
    );

    const header = el('div', { className: 'cw-header' }, headerAvatar, headerInfo, closeBtn);

    // Messages area
    messagesEl = el('div', {
      className: 'cw-messages',
      role: 'log',
      'aria-live': 'polite',
      'aria-label': 'Chat messages',
    });

    // Suggestions area — Requirement 7.x
    suggestionsEl = el('div', { className: 'cw-suggestions' });

    // Rate limit bar
    rateLimitBar = el('div', { className: 'cw-rate-limit-bar' });

    // Input area
    inputEl = el('textarea', {
      className: 'cw-input',
      placeholder: t('placeholder'),
      rows: '1',
      'aria-label': t('placeholder'),
      onkeydown: handleInputKeydown,
      oninput: autoResizeInput,
    });

    const sendSvg = svgIcon(
      '<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>'
    );
    sendBtn = el(
      'button',
      {
        className: 'cw-send-btn',
        'aria-label': t('sendAriaLabel'),
        onclick: () => handleSend(),
      },
      sendSvg
    );

    const inputArea = el('div', { className: 'cw-input-area' }, inputEl, sendBtn);

    panel = el(
      'div',
      {
        className: 'cw-panel',
        role: 'dialog',
        'aria-label': 'Chat assistant',
        'aria-modal': 'false',
      },
      header,
      messagesEl,
      suggestionsEl,
      rateLimitBar,
      inputArea
    );

    document.body.appendChild(bubbleBtn);
    document.body.appendChild(panel);

    // Close on outside click — Requirement 1.3
    document.addEventListener('click', (e) => {
      if (
        state.isOpen &&
        !panel.contains(e.target) &&
        !bubbleBtn.contains(e.target)
      ) {
        closePanel();
      }
    });

    // Close on Escape — Requirement 1.3
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isOpen) closePanel();
    });
  }

  // ─── Panel open/close ─────────────────────────────────────────────────────

  function openPanel() {
    state.isOpen = true;
    panel.classList.add('is-open');
    bubbleBtn.classList.add('is-open');
    bubbleBtn.setAttribute('aria-expanded', 'true');
    bubbleBtn.querySelector('.cw-bubble-dot')?.remove();

    // Show welcome + suggestions on first open — Requirement 7.1
    if (state.messages.length === 0) {
      addMessage('assistant', t('welcomeMsg'));
      renderSuggestions();
    }

    scrollToBottom();
    setTimeout(() => inputEl.focus(), 220);
  }

  function closePanel() {
    state.isOpen = false;
    panel.classList.remove('is-open');
    bubbleBtn.classList.remove('is-open');
    bubbleBtn.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() {
    state.isOpen ? closePanel() : openPanel();
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  function addMessage(role, content, opts = {}) {
    const msg = {
      id: generateUUIDv4(),
      role,
      content,
      timestamp: Date.now(),
      error: opts.error ?? false,
      sources: opts.sources ?? [],
    };

    state.messages.push(msg);
    // Keep only last MAX_MESSAGES
    if (state.messages.length > MAX_MESSAGES) {
      state.messages.shift();
    }

    renderMessage(msg);
    scrollToBottom();
    return msg;
  }

  function renderMessage(msg) {
    // Remove typing indicator if present
    typingEl?.remove();

    const bubbleClass =
      msg.role === 'user'
        ? 'cw-msg--user'
        : msg.error
        ? 'cw-msg--error'
        : 'cw-msg--assistant';

    const bubble = el('div', {
      className: `cw-msg-bubble`,
      textContent: msg.content,
    });

    const timeEl = el('span', {
      className: 'cw-msg-time',
      textContent: formatTime(msg.timestamp),
    });

    const wrapper = el('div', { className: `cw-msg ${bubbleClass}` }, bubble, timeEl);

    // Sources chips
    if (msg.sources && msg.sources.length > 0) {
      const sourcesEl = el('div', { className: 'cw-msg-sources' });
      for (const src of msg.sources) {
        sourcesEl.appendChild(
          el('span', { className: 'cw-source-chip', textContent: src })
        );
      }
      wrapper.appendChild(sourcesEl);
    }

    messagesEl.appendChild(wrapper);
  }

  function showTyping() {
    typingEl = el(
      'div',
      { className: 'cw-msg cw-msg--assistant' },
      el(
        'div',
        { className: 'cw-typing' },
        el('span'),
        el('span'),
        el('span')
      )
    );
    messagesEl.appendChild(typingEl);
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  // ─── Suggestions — Requirements 7.1–7.5 ──────────────────────────────────

  function renderSuggestions() {
    suggestionsEl.innerHTML = '';
    if (state.hasHadExchange) return; // Requirement 7.5

    const label = el('div', {
      className: 'cw-suggestion-label',
      textContent: t('suggestionsLabel'),
    });
    suggestionsEl.appendChild(label);

    for (const q of t('suggestions')) {
      const btn = el('button', {
        className: 'cw-suggestion-btn',
        textContent: q,
        onclick: () => {
          inputEl.value = q;
          handleSend();
        },
      });
      suggestionsEl.appendChild(btn);
    }
  }

  function hideSuggestions() {
    suggestionsEl.innerHTML = '';
  }

  // ─── Input helpers ────────────────────────────────────────────────────────

  function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function autoResizeInput() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }

  function setInputDisabled(disabled) {
    inputEl.disabled = disabled;
    sendBtn.disabled = disabled;
  }

  // ─── Rate limit UI — Requirement 5.2 ─────────────────────────────────────

  function startRateLimitCountdown(retryAfterSecs) {
    let remaining = Math.ceil(retryAfterSecs);
    state.rateLimitUntil = Date.now() + remaining * 1000;
    setInputDisabled(true);
    rateLimitBar.classList.add('is-visible');

    function tick() {
      remaining = Math.max(
        0,
        Math.ceil((state.rateLimitUntil - Date.now()) / 1000)
      );
      rateLimitBar.textContent = t('rateLimitMsg', remaining);
      if (remaining <= 0) {
        rateLimitBar.classList.remove('is-visible');
        state.rateLimitUntil = null;
        setInputDisabled(false);
        inputEl.focus();
      } else {
        state.rateLimitTimer = setTimeout(tick, 1000);
      }
    }
    tick();
  }

  // ─── Send message — Requirements 8.1, 8.2, 8.3 ───────────────────────────

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || state.isLoading) return;
    if (state.rateLimitUntil && Date.now() < state.rateLimitUntil) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    // Hide suggestions after first user message — Requirement 7.5
    if (!state.hasHadExchange) {
      hideSuggestions();
    }

    addMessage('user', text);
    await sendMessage(text);
  }

  /**
   * sendMessage with retry — Requirements 5.1, 5.3, 5.4
   * @param {string} text
   * @param {number} attempt
   */
  async function sendMessage(text, attempt = 0) {
    state.isLoading = true;
    setInputDisabled(true);

    if (attempt === 0) showTyping();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      // Read lang at exact moment of send — Requirement 6.3 / Property 13
      const lang = getLang();

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': state.sessionToken,
        },
        body: JSON.stringify({ message: text, lang }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // ── HTTP 429 rate limit — Requirement 5.2 ─────────────────────────
      if (response.status === 429) {
        typingEl?.remove();
        const data = await response.json().catch(() => ({}));
        const retryAfter = data.retry_after ?? 60;
        startRateLimitCountdown(retryAfter);
        state.isLoading = false;
        return;
      }

      // ── HTTP 400 / 422 — Requirement 5.3 ──────────────────────────────
      if (response.status === 400 || response.status === 422) {
        typingEl?.remove();
        const data = await response.json().catch(() => ({}));
        console.error('[chat-widget] Validation error:', data);
        addMessage('assistant', t('errorInvalidMsg'), { error: true });
        state.isLoading = false;
        setInputDisabled(false);
        return;
      }

      // ── HTTP 5xx or non-ok — Requirement 5.1, 5.4 ────────────────────
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // ── Success ───────────────────────────────────────────────────────
      const data = await response.json();
      typingEl?.remove();

      addMessage('assistant', data.answer, { sources: data.sources ?? [] });

      state.hasHadExchange = true;
      state.retryCount = 0;
      state.isLoading = false;
      setInputDisabled(false);
      inputEl.focus();
    } catch (err) {
      clearTimeout(timeoutId);

      const isTimeout = err.name === 'AbortError';
      console.error('[chat-widget] Request error:', isTimeout ? 'timeout' : err.message);

      // ── Retry logic — Requirement 5.4 ─────────────────────────────────
      if (attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt];
        await new Promise((r) => setTimeout(r, delay));
        return sendMessage(text, attempt + 1);
      }

      // ── Exhausted retries — show fallback — Requirement 5.1 ──────────
      typingEl?.remove();
      addMessage('assistant', t('fallback'), { error: true });
      state.isLoading = false;
      setInputDisabled(false);
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    // Only init once
    if (document.querySelector('.cw-bubble')) return;
    buildWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
