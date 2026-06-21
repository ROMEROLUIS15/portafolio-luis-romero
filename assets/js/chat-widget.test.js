/**
 * Chat Widget tests — Vitest + jsdom + fast-check
 * Feature: portfolio-conversational-agent
 * Requirements: 1.x, 5.x, 6.x, 7.x
 *
 * Strategy: the widget is an IIFE that mutates the DOM on execution.
 * We load it by reading the source and running it via Function() in jsdom context,
 * resetting the DOM between tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Widget source (read once) ────────────────────────────────────────────────

const WIDGET_SRC = readFileSync(
  resolve(process.cwd(), 'assets/js/chat-widget.js'),
  'utf-8'
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadWidget(lang = 'en', endpoint = 'https://mock.supabase.co/functions/v1/chat') {
  // Reset DOM completely
  document.body.innerHTML = '';
  document.documentElement.lang = lang;
  sessionStorage.clear();

  // Set endpoint on window
  window.__CHAT_ENDPOINT__ = endpoint;

  // Execute widget IIFE in current window context
  // eslint-disable-next-line no-new-func
  new Function(WIDGET_SRC)();
}

const getBubble     = () => document.querySelector('.cw-bubble');
const getPanel      = () => document.querySelector('.cw-panel');
const getInput      = () => document.querySelector('.cw-input');
const getSendBtn    = () => document.querySelector('.cw-send-btn');
const getSuggBtns   = () => document.querySelectorAll('.cw-suggestion-btn');
const getMessages   = () => document.querySelectorAll('.cw-msg');
const getRateLimitBar = () => document.querySelector('.cw-rate-limit-bar');

const isPanelOpen = () => getPanel()?.classList.contains('is-open') ?? false;
const isSuggestionsVisible = () => getSuggBtns().length > 0;

function clickBubble() { getBubble()?.click(); }

// ─── Example tests: DOM rendering — Requirement 1.1 ──────────────────────────

describe('Chat Widget — DOM rendering', () => {
  beforeEach(() => loadWidget('en'));
  afterEach(() => vi.restoreAllMocks());

  it('renders the bubble button in the DOM', () => {
    expect(getBubble()).toBeTruthy();
  });

  it('panel is closed by default', () => {
    expect(isPanelOpen()).toBe(false);
  });

  it('panel opens when bubble is clicked — Req 1.2', () => {
    clickBubble();
    expect(isPanelOpen()).toBe(true);
  });

  it('panel closes when bubble is clicked again — Req 1.3', () => {
    clickBubble();
    clickBubble();
    expect(isPanelOpen()).toBe(false);
  });

  it('panel closes on Escape key — Req 1.3', () => {
    clickBubble();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isPanelOpen()).toBe(false);
  });

  it('panel closes on click outside — Req 1.3', () => {
    clickBubble();
    // Click on body (outside panel and bubble)
    const outsideEl = document.createElement('div');
    document.body.appendChild(outsideEl);
    outsideEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(isPanelOpen()).toBe(false);
  });

  it('shows welcome message on first open', () => {
    clickBubble();
    const msgs = getMessages();
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].classList.contains('cw-msg--assistant')).toBe(true);
  });

  it('history persists after closing and reopening — Req 1.4', () => {
    clickBubble(); // open → welcome message added
    const countAfterOpen = getMessages().length;
    clickBubble(); // close
    clickBubble(); // reopen
    // Messages should still be there (no re-init because bubble already exists)
    expect(getMessages().length).toBe(countAfterOpen);
  });
});

// ─── Example tests: Localisation — Requirement 1.6 ───────────────────────────

describe('Chat Widget — Localisation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('placeholder contains English hint when lang=en', () => {
    loadWidget('en');
    expect(getInput()?.placeholder).toBeTruthy();
    // Should be non-empty
    expect(getInput()?.placeholder.length).toBeGreaterThan(0);
  });

  it('shows 3 EN suggested questions', () => {
    loadWidget('en');
    clickBubble();
    const texts = Array.from(getSuggBtns()).map(b => b.textContent ?? '');
    expect(texts.some(t => t.includes('LangGraph'))).toBe(true);
    expect(texts.some(t => t.includes('Cronix'))).toBe(true);
  });

  it('shows 3 ES suggested questions', () => {
    loadWidget('es');
    clickBubble();
    const texts = Array.from(getSuggBtns()).map(b => b.textContent ?? '');
    expect(texts.some(t => t.includes('LangGraph'))).toBe(true);
    expect(texts.some(t => t.includes('métricas'))).toBe(true);
  });
});

// ─── Example tests: Suggested questions — Requirements 7.1–7.4 ───────────────

describe('Chat Widget — Suggested questions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows exactly 3 suggested questions on first open', () => {
    loadWidget('en');
    clickBubble();
    expect(getSuggBtns().length).toBe(3);
  });

  it('clicking a suggestion fills and sends it — Req 7.4', async () => {
    loadWidget('en');
    let sentBody = null;
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ answer: 'Mock answer', sources: [] }),
    });

    clickBubble();
    const firstSugg = getSuggBtns()[0];
    const suggText = firstSugg.textContent;
    firstSugg.click();

    await new Promise(r => setTimeout(r, 50));
    // A user message should have appeared
    const userMsgs = Array.from(getMessages()).filter(m => m.classList.contains('cw-msg--user'));
    expect(userMsgs.length).toBeGreaterThan(0);
    expect(userMsgs[0].querySelector('.cw-msg-bubble')?.textContent).toBe(suggText);
  });
});

// ─── Example tests: Rate limit UI — Requirement 5.2 ─────────────────────────

describe('Chat Widget — Rate limit UI (HTTP 429)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('disables input and shows countdown bar on 429', async () => {
    loadWidget('en');
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 429,
      json: () => Promise.resolve({ error: 'rate_limit_exceeded', retry_after: 30 }),
    });

    clickBubble();
    getInput().value = 'test question';
    getSendBtn()?.click();

    await new Promise(r => setTimeout(r, 100));

    expect(getInput()?.disabled).toBe(true);
    expect(getRateLimitBar()?.classList.contains('is-visible')).toBe(true);
  });
});

// ─── Property 10: Suggested questions hidden after first exchange ─────────────
// Feature: portfolio-conversational-agent
// Property 10: Preguntas sugeridas invisibles tras primer intercambio

describe('Property 10 — Suggestions hidden after first exchange', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PBT: suggestions hidden for any N completed exchanges (N ≥ 1)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (exchanges) => {
          loadWidget('en');

          vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ answer: 'Mock answer', sources: [] }),
          });

          clickBubble();

          for (let i = 0; i < exchanges; i++) {
            const input = getInput();
            if (input && !input.disabled) {
              input.value = `Question ${i + 1}`;
              getSendBtn()?.click();
              await new Promise(r => setTimeout(r, 50));
            }
          }

          // After ≥1 exchange, suggestions must be hidden — Requirement 7.5
          expect(isSuggestionsVisible()).toBe(false);
        }
      ),
      { numRuns: 10, verbose: true }
    );
  });
});

// ─── Property 11: Retry exhausted before showing fallback ────────────────────
// Feature: portfolio-conversational-agent
// Property 11: Retry exhausto antes de mostrar fallback definitivo

describe('Property 11 — Retry exhausted before fallback', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PBT: exactly 3 fetch calls before fallback on 5xx/timeout', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // true = 500 response, false = network error
        async (use500) => {
          // Use fake timers so retry delays (1s, 2s) are instant
          vi.useFakeTimers();

          loadWidget('en');

          let callCount = 0;
          vi.spyOn(global, 'fetch').mockImplementation(() => {
            callCount++;
            if (use500) {
              return Promise.resolve({
                ok: false, status: 500,
                json: () => Promise.resolve({ error: 'internal_error' }),
              });
            }
            return Promise.reject(new Error('Network error'));
          });

          clickBubble();
          getInput().value = 'Test question';
          getSendBtn()?.click();

          // Advance fake timers past all retry delays (1000ms + 2000ms) in steps
          // to let microtasks (promises) resolve between ticks
          await vi.advanceTimersByTimeAsync(1100);
          await vi.advanceTimersByTimeAsync(2100);
          await vi.advanceTimersByTimeAsync(500);

          vi.useRealTimers();

          // Must make exactly 3 attempts — Requirement 5.4
          expect(callCount).toBe(3);

          // Must show error/fallback message — Requirement 5.1
          const msgs = Array.from(getMessages());
          const hasError = msgs.some(m =>
            m.classList.contains('cw-msg--error') ||
            (m.classList.contains('cw-msg--assistant') &&
              (m.textContent?.includes('unavailable') || m.textContent?.includes('lueduar15')))
          );
          expect(hasError).toBe(true);
        }
      ),
      { numRuns: 4, verbose: true }
    );
  }, 30000);
});

// ─── Property 13: Widget transmits lang at exact send moment ──────────────────
// Feature: portfolio-conversational-agent
// Property 13: El widget transmite el lang del documento en el momento exacto del envío

describe('Property 13 — Lang transmitted at exact send moment', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PBT: body.lang equals document.documentElement.lang at send time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant('en'), fc.constant('es')),
        async (lang) => {
          loadWidget(lang);

          let capturedLang = null;
          vi.spyOn(global, 'fetch').mockImplementation((_url, opts) => {
            const body = JSON.parse(opts?.body ?? '{}');
            capturedLang = body.lang;
            return Promise.resolve({
              ok: true, status: 200,
              json: () => Promise.resolve({ answer: 'ok', sources: [] }),
            });
          });

          clickBubble();
          getInput().value = 'What is Luis experience?';
          getSendBtn()?.click();

          await new Promise(r => setTimeout(r, 80));

          // lang in request body must match document.documentElement.lang at send time
          expect(capturedLang).toBe(lang);
        }
      ),
      { numRuns: 100, verbose: true }
    );
  }, 30000);

  it('PBT: lang in body reflects DOM value at send time, even if changed mid-session', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant('en'), fc.constant('es')),
        fc.oneof(fc.constant('en'), fc.constant('es')),
        async (initialLang, langAtSendTime) => {
          loadWidget(initialLang);

          let capturedLang = null;
          vi.spyOn(global, 'fetch').mockImplementation((_url, opts) => {
            const body = JSON.parse(opts?.body ?? '{}');
            capturedLang = body.lang;
            return Promise.resolve({
              ok: true, status: 200,
              json: () => Promise.resolve({ answer: 'ok', sources: [] }),
            });
          });

          clickBubble();

          // Change lang AFTER opening widget but BEFORE sending
          document.documentElement.lang = langAtSendTime;

          getInput().value = 'Test message';
          getSendBtn()?.click();

          await new Promise(r => setTimeout(r, 80));

          if (capturedLang !== null) {
            // Must match the lang AT send time, not initial lang — Requirement 6.3
            expect(capturedLang).toBe(langAtSendTime === 'es' ? 'es' : 'en');
          }
        }
      ),
      { numRuns: 100, verbose: true }
    );
  }, 30000);
});
