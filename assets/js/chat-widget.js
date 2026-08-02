/**
 * Chat Widget — Portfolio Conversational Agent
 * Vanilla JS IIFE — zero dependencies
 * Requirements: 1.x, 5.x, 6.x, 7.x, 8.x
 */
(function ChatWidget() {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────

  /** @type {string} */
  const ENDPOINT =
    (typeof window !== 'undefined' && window.__CHAT_ENDPOINT__)
      ? window.__CHAT_ENDPOINT__
      : 'https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/chat';

  /** @type {string} — public Supabase anon key, safe to embed in the frontend */
  const ANON_KEY =
    (typeof window !== 'undefined' && window.__CHAT_ANON_KEY__)
      ? window.__CHAT_ANON_KEY__
      : '';

  /** @readonly */
  const CONFIG = Object.freeze({
    maxMessages:       20,
    requestTimeoutMs:  8000,
    retryDelaysMs:     [1000, 2000],
  });

  // ─── i18n ──────────────────────────────────────────────────────────────────

  /** @type {Record<'en'|'es', Record<string, string | Function | string[]>>} */
  const I18N = Object.freeze({
    en: {
      headerName:      "Luis's AI Assistant",
      headerStatus:    'Online',
      placeholder:     'Ask me anything about Luis…',
      welcomeMsg:      "Hi! I'm Luis's AI assistant. I can answer questions about his experience, projects, and skills. What would you like to know?",
      suggestionsLabel:'Suggested questions',
      suggestions: [
        "What is Luis's experience with LangGraph?",
        "What are Cronix's real production metrics?",
        'What stack does Luis use for anti-hallucination systems?',
      ],
      fallback:        'Sorry, the agent is currently unavailable. You can reach me at lueduar15@gmail.com',
      rateLimitMsg:    (secs) => `Too many requests. Please wait ${secs}s.`,
      errorInvalidMsg: 'Invalid message. Please keep it under 500 characters.',
      sendAriaLabel:   'Send message',
    },
    es: {
      headerName:      'Asistente IA de Luis',
      headerStatus:    'En línea',
      placeholder:     'Pregúntame algo sobre Luis…',
      welcomeMsg:      '¡Hola! Soy el asistente IA de Luis. Puedo responder preguntas sobre su experiencia, proyectos y habilidades. ¿Qué te gustaría saber?',
      suggestionsLabel:'Preguntas sugeridas',
      suggestions: [
        '¿Qué experiencia tiene Luis con LangGraph?',
        '¿Cuáles son las métricas reales de Cronix?',
        '¿Qué stack usa Luis para sistemas anti-alucinación?',
      ],
      fallback:        'Lo siento, el agente no está disponible. Puedes contactarme en lueduar15@gmail.com',
      rateLimitMsg:    (secs) => `Demasiadas solicitudes. Por favor espera ${secs}s.`,
      errorInvalidMsg: 'Mensaje inválido. Mantenlo bajo 500 caracteres.',
      sendAriaLabel:   'Enviar mensaje',
    },
  });

  // ─── Session token ─────────────────────────────────────────────────────────

  const UUID_V4_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function generateUUIDv4() {
    // Prefer the native generator — always RFC-4122 compliant
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback: variant nibble must be 8, 9, a or b → mask with 0x3 then set bit 3
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const rand = crypto.getRandomValues(new Uint8Array(1))[0];
      const r = c === 'x' ? rand & 0x0f : (rand & 0x3) | 0x8;
      return r.toString(16);
    });
  }

  function getOrCreateSessionToken() {
    const key    = 'cw_session_token';
    const stored = sessionStorage.getItem(key);
    // Reuse only if the cached token is a valid v4 — heal sessions that
    // received a malformed token from the previous generator
    if (stored && UUID_V4_RE.test(stored)) return stored;
    const token = generateUUIDv4();
    sessionStorage.setItem(key, token);
    return token;
  }

  // ─── State (single source of truth, never accessed directly outside helpers)

  const state = {
    sessionToken:   getOrCreateSessionToken(),
    /** @type {Array<{id:string, role:string, content:string, timestamp:number, error:boolean, sources:string[]}>} */
    messages:       [],
    isOpen:         false,
    isLoading:      false,
    hasHadExchange: false,
    rateLimitUntil: /** @type {number|null} */ (null),
    rateLimitTimer: /** @type {ReturnType<typeof setTimeout>|null} */ (null),
    _justOpened:    false,  // prevent close-on-same-tick when panel opens
  };

  // ─── i18n helpers ──────────────────────────────────────────────────────────

  function getLang() {
    return document.documentElement.lang === 'es' ? 'es' : 'en';
  }

  function t(key, ...args) {
    const val = I18N[getLang()][key];
    return typeof val === 'function' ? val(...args) : val;
  }

  // ─── DOM factory helpers ───────────────────────────────────────────────────

  /**
   * Creates a DOM element with attributes, event listeners, and children.
   * Never uses innerHTML — safe from XSS.
   * @param {string} tag
   * @param {Record<string, any>} attrs
   * @param {...(Node|string|null|undefined)} children
   * @returns {HTMLElement}
   */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className')        node.className = v;
      else if (k === 'textContent') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else                          node.setAttribute(k, v);
    }
    for (const child of children) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  /**
   * Creates an inline SVG icon (stroke-based, currentColor).
   * @param {string} pathMarkup  SVG inner markup
   * @param {string} [viewBox]
   * @returns {SVGElement}
   */
  function svgIcon(pathMarkup, viewBox = '0 0 24 24') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox',           viewBox);
    svg.setAttribute('fill',              'none');
    svg.setAttribute('stroke',            'currentColor');
    svg.setAttribute('stroke-width',      '2');
    svg.setAttribute('stroke-linecap',    'round');
    svg.setAttribute('stroke-linejoin',   'round');
    svg.innerHTML = pathMarkup; // SVG path strings are safe — not user input
    return svg;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString(getLang() === 'es' ? 'es-CO' : 'en-US', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  // ─── DOM refs (populated by buildWidget, never reassigned after that) ───────

  /** @type {{ bubble: HTMLButtonElement, panel: HTMLElement, messages: HTMLElement, input: HTMLTextAreaElement, sendBtn: HTMLButtonElement, suggestions: HTMLElement, rateLimitBar: HTMLElement, typing: HTMLElement|null }} */
  const dom = {
    bubble:       null,
    panel:        null,
    messages:     null,
    input:        null,
    sendBtn:      null,
    suggestions:  null,
    rateLimitBar: null,
    typing:       null,
  };

  // ─── Widget construction ───────────────────────────────────────────────────

  function buildBubble() {
    // Robot head: antenna, screen-like face with two eyes, and side ears.
    // Reads as "AI assistant" at a glance, which a plain speech bubble did not.
    const iconChat  = svgIcon(
      '<path d="M12 6V3.5"></path>' +
      '<circle cx="12" cy="2.5" r="1.2"></circle>' +
      '<rect x="4" y="6" width="16" height="12" rx="3"></rect>' +
      '<path d="M2 11v3M22 11v3"></path>' +
      // Eyes filled, not stroked: a 2px outline on a 1.3 radius reads as a blob.
      '<circle cx="9" cy="11.5" r="1.3" fill="currentColor" stroke="none"></circle>' +
      '<circle cx="15" cy="11.5" r="1.3" fill="currentColor" stroke="none"></circle>' +
      '<path d="M9.5 14.8h5"></path>'
    );
    const iconClose = svgIcon('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>');
    iconChat.classList.add('cw-bubble-icon', 'cw-bubble-icon--chat');
    iconClose.classList.add('cw-bubble-icon', 'cw-bubble-icon--close');

    return el(
      'button',
      { className: 'cw-bubble', 'aria-label': 'Open chat assistant', 'aria-expanded': 'false', onclick: togglePanel },
      iconChat,
      iconClose
    );
  }

  function buildHeader() {
    const avatarSvg = svgIcon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>');
    const closeSvg  = svgIcon('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>');

    return el('div', { className: 'cw-header' },
      el('div', { className: 'cw-header-avatar' }, avatarSvg),
      el('div', { className: 'cw-header-info' },
        el('div', { className: 'cw-header-name',   textContent: t('headerName')   }),
        el('div', { className: 'cw-header-status', textContent: t('headerStatus') })
      ),
      el('button', { className: 'cw-close-btn', 'aria-label': 'Close chat', onclick: togglePanel }, closeSvg)
    );
  }

  function buildInputArea() {
    const sendSvg = svgIcon('<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>');

    dom.input = el('textarea', {
      className:   'cw-input',
      placeholder: t('placeholder'),
      rows:        '1',
      'aria-label': t('placeholder'),
      onkeydown:   handleInputKeydown,
      oninput:     autoResizeInput,
    });

    dom.sendBtn = el('button', {
      className:   'cw-send-btn',
      'aria-label': t('sendAriaLabel'),
      onclick:     () => handleSend(),
    }, sendSvg);

    return el('div', { className: 'cw-input-area' }, dom.input, dom.sendBtn);
  }

  function buildWidget() {
    dom.bubble       = buildBubble();
    dom.messages     = el('div', { className: 'cw-messages', role: 'log', 'aria-live': 'polite', 'aria-label': 'Chat messages' });
    dom.suggestions  = el('div', { className: 'cw-suggestions' });
    dom.rateLimitBar = el('div', { className: 'cw-rate-limit-bar' });

    const inputArea = buildInputArea();

    dom.panel = el('div',
      { className: 'cw-panel', role: 'dialog', 'aria-label': 'Chat assistant', 'aria-modal': 'false' },
      buildHeader(),
      dom.messages,
      dom.suggestions,
      dom.rateLimitBar,
      inputArea
    );

    document.body.appendChild(dom.bubble);
    document.body.appendChild(dom.panel);
    attachGlobalListeners();
  }

  function attachGlobalListeners() {
    // Close on outside click — Requirement 1.3
    // Use capture=false so the bubble's own click handler runs first and sets
    // a short-lived flag, preventing the document listener from immediately
    // closing the panel on the very same click that opened it.
    document.addEventListener('click', (e) => {
      // Use composedPath() (snapshotted at dispatch) instead of contains():
      // a handler such as a suggestion click may detach its target from the
      // DOM before this listener runs, which would make contains() report the
      // click as "outside" and wrongly close the panel.
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      const insideWidget = path.includes(dom.panel) || path.includes(dom.bubble);
      if (state.isOpen && !state._justOpened && !insideWidget) {
        closePanel();
      }
      state._justOpened = false;
    });
    // Close on Escape — Requirement 1.3
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isOpen) closePanel();
    });
  }

  // ─── Panel state ───────────────────────────────────────────────────────────

  function openPanel() {
    state.isOpen     = true;
    state._justOpened = true; // prevent document click listener from closing on same tick
    dom.panel.classList.add('is-open');
    dom.bubble.classList.add('is-open');
    dom.bubble.setAttribute('aria-expanded', 'true');

    if (state.messages.length === 0) {
      addMessage('assistant', t('welcomeMsg'));
      renderSuggestions();
    }

    scrollToBottom();
    setTimeout(() => dom.input.focus(), 220);
  }

  function closePanel() {
    state.isOpen = false;
    dom.panel.classList.remove('is-open');
    dom.bubble.classList.remove('is-open');
    dom.bubble.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() {
    state.isOpen ? closePanel() : openPanel();
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  function addMessage(role, content, opts = {}) {
    const msg = {
      id:        generateUUIDv4(),
      role,
      content,
      timestamp: Date.now(),
      error:     opts.error   ?? false,
      sources:   opts.sources ?? [],
    };

    state.messages.push(msg);
    if (state.messages.length > CONFIG.maxMessages) state.messages.shift();

    renderMessage(msg);
    scrollToBottom();
    return msg;
  }

  function renderMessage(msg) {
    dom.typing?.remove();
    dom.typing = null;

    const roleClass =
      msg.role === 'user' ? 'cw-msg--user'
      : msg.error         ? 'cw-msg--error'
      :                     'cw-msg--assistant';

    const wrapper = el('div', { className: `cw-msg ${roleClass}` },
      el('div', { className: 'cw-msg-bubble', textContent: msg.content }),
      el('span', { className: 'cw-msg-time',   textContent: formatTime(msg.timestamp) })
    );

    // Source filenames are intentionally not rendered — they read as raw
    // document names (e.g. a CV PDF) and look out of place in a conversational
    // assistant. Sources are still returned by the API for observability.

    dom.messages.appendChild(wrapper);
  }

  function showTyping() {
    dom.typing = el('div', { className: 'cw-msg cw-msg--assistant' },
      el('div', { className: 'cw-typing' }, el('span'), el('span'), el('span'))
    );
    dom.messages.appendChild(dom.typing);
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { dom.messages.scrollTop = dom.messages.scrollHeight; });
  }

  // ─── Suggestions — Requirements 7.1–7.5 ───────────────────────────────────

  function renderSuggestions() {
    dom.suggestions.innerHTML = '';
    if (state.hasHadExchange) return;

    dom.suggestions.appendChild(
      el('div', { className: 'cw-suggestion-label', textContent: t('suggestionsLabel') })
    );

    for (const question of t('suggestions')) {
      dom.suggestions.appendChild(
        el('button', {
          className:   'cw-suggestion-btn',
          textContent: question,
          onclick:     () => { dom.input.value = question; handleSend(); },
        })
      );
    }
  }

  function hideSuggestions() {
    dom.suggestions.innerHTML = '';
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function autoResizeInput() {
    dom.input.style.height = 'auto';
    dom.input.style.height = `${Math.min(dom.input.scrollHeight, 120)}px`;
  }

  function setInputDisabled(disabled) {
    dom.input.disabled  = disabled;
    dom.sendBtn.disabled = disabled;
  }

  // ─── Rate limit UI — Requirement 5.2 ──────────────────────────────────────

  function startRateLimitCountdown(retryAfterSecs) {
    if (state.rateLimitTimer) clearTimeout(state.rateLimitTimer);

    state.rateLimitUntil = Date.now() + Math.ceil(retryAfterSecs) * 1000;
    setInputDisabled(true);
    dom.rateLimitBar.classList.add('is-visible');

    function tick() {
      const remaining = Math.max(0, Math.ceil((state.rateLimitUntil - Date.now()) / 1000));
      dom.rateLimitBar.textContent = t('rateLimitMsg', remaining);

      if (remaining <= 0) {
        dom.rateLimitBar.classList.remove('is-visible');
        state.rateLimitUntil = null;
        state.rateLimitTimer = null;
        setInputDisabled(false);
        dom.input.focus();
      } else {
        state.rateLimitTimer = setTimeout(tick, 1000);
      }
    }
    tick();
  }

  // ─── Send & retry — Requirements 5.1, 5.3, 5.4 ───────────────────────────

  async function handleSend() {
    const text = dom.input.value.trim();
    if (!text || state.isLoading) return;
    if (state.rateLimitUntil && Date.now() < state.rateLimitUntil) return;

    // Client-side validation to avoid round-trip for obvious errors
    if (text.length > 1000) {
      addMessage('assistant', t('errorInvalidMsg'), { error: true });
      return;
    }

    dom.input.value        = '';
    dom.input.style.height = 'auto';

    if (!state.hasHadExchange) hideSuggestions();

    addMessage('user', text);
    await sendMessage(text, 0);
  }

  /**
   * Sends a message with exponential retry on 5xx / timeout.
   * @param {string} text
   * @param {number} attempt  0-indexed
   */
  async function sendMessage(text, attempt) {
    state.isLoading = true;
    setInputDisabled(true);
    if (attempt === 0) showTyping();

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);

    try {
      const lang     = getLang(); // read at exact send moment — Requirement 6.3
      const headers = { 'Content-Type': 'application/json', 'X-Session-Token': state.sessionToken };
      if (ANON_KEY) {
        headers['Authorization'] = `Bearer ${ANON_KEY}`;
      }
      const response = await fetch(ENDPOINT, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ message: text, lang }),
        signal:  controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        dom.typing?.remove(); dom.typing = null;
        const data = await response.json().catch(() => ({}));
        startRateLimitCountdown(data.retry_after ?? 60);
        state.isLoading = false;
        return;
      }

      if (response.status === 400 || response.status === 422) {
        dom.typing?.remove(); dom.typing = null;
        const data = await response.json().catch(() => ({}));
        console.error('[chat-widget] Validation error:', data);
        addMessage('assistant', t('errorInvalidMsg'), { error: true });
        state.isLoading = false;
        setInputDisabled(false);
        return;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      dom.typing?.remove(); dom.typing = null;

      addMessage('assistant', data.answer, { sources: data.sources ?? [] });
      state.hasHadExchange = true;
      state.isLoading      = false;
      setInputDisabled(false);
      dom.input.focus();

    } catch (err) {
      clearTimeout(timeoutId);
      console.error('[chat-widget] Request error:', err.name === 'AbortError' ? 'timeout' : err.message);

      if (attempt < CONFIG.retryDelaysMs.length) {
        await new Promise((r) => setTimeout(r, CONFIG.retryDelaysMs[attempt]));
        return sendMessage(text, attempt + 1);
      }

      dom.typing?.remove(); dom.typing = null;
      addMessage('assistant', t('fallback'), { error: true });
      state.isLoading = false;
      setInputDisabled(false);
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (document.querySelector('.cw-bubble')) return; // prevent double init
    buildWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
