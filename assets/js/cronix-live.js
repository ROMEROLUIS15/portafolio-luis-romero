/* ============================================
   CRONIX LIVE — metrics + AI architecture
   ============================================ */
(function () {
  const lang = document.documentElement.lang === 'es' ? 'es' : 'en';
  const isSpanish = lang === 'es';

  /* ---------- STATS FETCH ---------- */
  const STATS_URL = isSpanish
    ? '../cronix-stats.json'
    : 'cronix-stats.json';

  /* ---------- COUNTER ANIMATION ---------- */
  function animateCounter(el, target, suffix, duration) {
    const isFloat = String(target).includes('.');
    const decimals = isFloat ? 1 : 0;
    const start = 0;
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * eased;
      el.textContent = current.toFixed(decimals) + (suffix || '');
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  /* ---------- RENDER METRICS ---------- */
  function renderMetrics(stats) {
    const grid = document.getElementById('metricsGrid');
    if (!grid) return;

    // Technical metrics first (what impresses engineers/recruiters)
    // Business context as supporting sub-labels
    const items = isSpanish ? [
      {
        icon: 'uil uil-check-circle',
        value: stats.tests_total,
        suffix: '+',
        label: 'Tests escritos',
        sub: 'Vitest · Playwright · pgTAP',
        highlight: true,
      },
      {
        icon: 'uil uil-shield-check',
        value: stats.rls_policies,
        suffix: '',
        label: 'Políticas RLS',
        sub: `${stats.rls_tables} tablas · aislamiento total`,
        highlight: true,
      },
      {
        icon: 'uil uil-brain',
        value: stats.anti_hallucination_layers,
        suffix: '',
        label: 'Capas anti-alucinación',
        sub: `~${stats.anti_hallucination_mechanisms} mecanismos`,
        highlight: true,
      },
      {
        icon: 'uil uil-history',
        value: stats.ci_checks,
        suffix: '',
        label: 'Asserts pgTAP en CI',
        sub: 'RLS validada automáticamente',
        highlight: true,
      },
      {
        icon: 'uil uil-bolt',
        value: stats.edge_functions,
        suffix: '',
        label: 'Edge Functions',
        sub: 'Deno · latencia global mínima',
        highlight: false,
      },
      {
        icon: 'uil uil-server',
        value: stats.uptime_pct,
        suffix: '%',
        label: 'Uptime',
        sub: 'producción 24/7 sin intervención',
        highlight: false,
      },
      {
        icon: 'uil uil-calendar-alt',
        value: stats.appointments_total,
        suffix: '+',
        label: 'Citas gestionadas',
        sub: 'cero intervención manual · 24/7',
        highlight: false,
        staticVal: null,
      },
      {
        icon: 'uil uil-robot',
        value: null,
        suffix: '',
        label: 'Sin humano en el flujo',
        sub: 'WhatsApp + voz · agenda, reagenda, cancela',
        highlight: false,
        staticVal: '24/7',
      },
    ] : [
      {
        icon: 'uil uil-check-circle',
        value: stats.tests_total,
        suffix: '+',
        label: 'Tests written',
        sub: 'Vitest · Playwright · pgTAP',
        highlight: true,
      },
      {
        icon: 'uil uil-shield-check',
        value: stats.rls_policies,
        suffix: '',
        label: 'RLS Policies',
        sub: `${stats.rls_tables} tables · total tenant isolation`,
        highlight: true,
      },
      {
        icon: 'uil uil-brain',
        value: stats.anti_hallucination_layers,
        suffix: '',
        label: 'Anti-hallucination layers',
        sub: `~${stats.anti_hallucination_mechanisms} mechanisms`,
        highlight: true,
      },
      {
        icon: 'uil uil-history',
        value: stats.ci_checks,
        suffix: '',
        label: 'pgTAP asserts in CI',
        sub: 'RLS validated automatically',
        highlight: true,
      },
      {
        icon: 'uil uil-bolt',
        value: stats.edge_functions,
        suffix: '',
        label: 'Edge Functions',
        sub: 'Deno · global low latency',
        highlight: false,
      },
      {
        icon: 'uil uil-server',
        value: stats.uptime_pct,
        suffix: '%',
        label: 'Uptime',
        sub: '24/7 production · no manual intervention',
        highlight: false,
      },
      {
        icon: 'uil uil-calendar-alt',
        value: stats.appointments_total,
        suffix: '+',
        label: 'Appointments managed',
        sub: 'zero manual intervention · 24/7',
        highlight: false,
        staticVal: null,
      },
      {
        icon: 'uil uil-robot',
        value: null,
        suffix: '',
        label: 'No human in the loop',
        sub: 'WhatsApp + voice · books, reschedules, cancels',
        highlight: false,
        staticVal: '24/7',
      },
    ];

    grid.innerHTML = items.map(item => `
      <div class="metric-card reveal${item.highlight ? ' metric-card--hi' : ''}">
        <i class="${item.icon} metric-icon"></i>
        <span class="metric-value${item.staticVal ? ' static' : ''}"${item.staticVal ? '' : ` data-target="${item.value}" data-suffix="${item.suffix}"`}>
          ${item.staticVal ? item.staticVal : `0${item.suffix}`}
        </span>
        <span class="metric-label">${item.label}</span>
        <span class="metric-sub">${item.sub}</span>
      </div>
    `).join('');

    // Update last-updated timestamp
    const updatedEl = document.getElementById('liveUpdated');
    if (updatedEl && stats.last_updated) {
      const d = new Date(stats.last_updated);
      const fmt = d.toLocaleDateString(isSpanish ? 'es-CO' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      updatedEl.textContent = isSpanish ? `Actualizado: ${fmt}` : `Last updated: ${fmt}`;
    }

    // Update commit msg
    const commitEl = document.getElementById('lastCommit');
    if (commitEl && stats.last_commit_msg) {
      commitEl.textContent = stats.last_commit_msg;
    }
  }

  /* ---------- RENDER CHANGELOG ---------- */
  function renderChangelog(stats) {
    const list = document.getElementById('changelogList');
    if (!list || !stats.changelog) return;

    list.innerHTML = stats.changelog.slice(0, 6).map(item => `
      <div class="changelog-item">
        <span class="changelog-date">${item.date}</span>
        <span class="changelog-type cl-${item.type}">${item.type}</span>
        <span class="changelog-msg">${item.msg}</span>
      </div>
    `).join('');
  }

  /* ---------- INTERSECTION OBSERVER — trigger counters ---------- */
  function observeCounters() {
    const cards = document.querySelectorAll('.metric-card');
    if (!cards.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target.querySelector('.metric-value');
        if (!el || el.dataset.animated) return;
        el.dataset.animated = '1';
        const target = parseFloat(el.dataset.target);
        const suffix = el.dataset.suffix || '';
        animateCounter(el, target, suffix, 1400);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.3 });

    cards.forEach(c => observer.observe(c));
  }

  /* ---------- AI ARCHITECTURE LAYERS ---------- */
  const layers = isSpanish ? [
    {
      num: 'C1',
      name: 'Fast Paths',
      short: 'Consultas conocidas → BD directa, sin LLM',
      detail: 'Cuando la consulta del usuario corresponde a un patrón conocido (ej: "¿cuándo es mi cita?"), el sistema responde <strong>directamente desde la base de datos</strong> sin invocar el LLM. Superficie de alucinación: cero. Latencia: mínima.',
    },
    {
      num: 'C2',
      name: 'Verificación de Identidad',
      short: 'Cliente confirmado antes de cualquier operación',
      detail: 'Antes de leer o escribir cualquier dato, el sistema verifica la identidad del cliente contra la BD. <strong>Evita actuar sobre datos del cliente equivocado</strong> — el riesgo principal de conectar un LLM a una BD real multi-tenant.',
    },
    {
      num: 'C3',
      name: 'Tool Calling Restringido',
      short: 'Function calling limitado a args declarados',
      detail: 'El LLM solo puede invocar funciones con <strong>argumentos previamente declarados y tipados</strong>. No puede inventar parámetros ni acceder a herramientas fuera del conjunto permitido para la sesión actual.',
    },
    {
      num: 'C4',
      name: 'Confirmation-Gate de 2 Turnos',
      short: 'Mutaciones requieren confirmación explícita',
      detail: 'Toda operación destructiva (agendar, reagendar, cancelar) <strong>requiere confirmación explícita del usuario en un segundo turno</strong>. El sistema nunca actúa de forma irreversible con una sola instrucción.',
    },
    {
      num: 'C5',
      name: 'Response Guardrail',
      short: 'Output validado contra patrones seguros',
      detail: 'La respuesta generada por el LLM pasa por una <strong>capa de validación</strong> que verifica que esté dentro del dominio permitido antes de entregársela al usuario. Bloquea respuestas fuera de tema, datos inventados o información privada.',
    },
    {
      num: 'C6',
      name: 'Observabilidad y Regresión en CI',
      short: 'LLM-as-judge · tracing multi-tenant · p50/p95',
      detail: 'Suite de regresión con <strong>LLM-as-judge (DeepEval)</strong> sobre golden datasets versionados, integrada en CI. Tracing multi-tenant exportado a LangSmith con dashboard de latencia p50/p95 por negocio. Cualquier degradación en la fiabilidad del agente rompe el pipeline.',
    },
  ] : [
    {
      num: 'L1',
      name: 'Fast Paths',
      short: 'Known queries → DB direct, no LLM call',
      detail: 'When the user query matches a known pattern (e.g. "when is my appointment?"), the system responds <strong>directly from the database</strong> without invoking the LLM. Hallucination surface: zero. Latency: minimal.',
    },
    {
      num: 'L2',
      name: 'Identity Verification',
      short: 'Client confirmed before any operation',
      detail: 'Before reading or writing any data, the system verifies client identity against the DB. <strong>Prevents acting on the wrong client\'s data</strong> — the primary risk of connecting an LLM to a real multi-tenant database.',
    },
    {
      num: 'L3',
      name: 'Restricted Tool Calling',
      short: 'Function calling limited to declared args',
      detail: 'The LLM can only invoke functions with <strong>pre-declared, typed arguments</strong>. It cannot invent parameters or access tools outside the permitted set for the current session.',
    },
    {
      num: 'L4',
      name: '2-Turn Confirmation Gate',
      short: 'Mutations require explicit confirmation',
      detail: 'Every destructive operation (book, reschedule, cancel) <strong>requires explicit user confirmation in a second turn</strong>. The system never acts irreversibly on a single instruction.',
    },
    {
      num: 'L5',
      name: 'Response Guardrail',
      short: 'Output validated against safe patterns',
      detail: 'The LLM\'s generated response passes through a <strong>validation layer</strong> checking it\'s within the allowed domain before delivery. Blocks off-topic responses, hallucinated data, or leaked private information.',
    },
    {
      num: 'L6',
      name: 'Observability & CI Regression',
      short: 'LLM-as-judge · multi-tenant tracing · p50/p95',
      detail: 'Regression suite with <strong>LLM-as-judge (DeepEval)</strong> over versioned golden datasets, integrated into CI. Multi-tenant tracing exported to LangSmith with p50/p95 latency dashboard per business. Any reliability degradation breaks the pipeline.',
    },
  ];

  function renderDiagram() {
    const diagram = document.getElementById('aiDiagram');
    if (!diagram) return;

    const inputLabel  = isSpanish ? 'Usuario / WhatsApp / Voz' : 'User / WhatsApp / Voice';
    const outputLabel = isSpanish ? 'Respuesta validada' : 'Validated response';
    const clickHint   = isSpanish ? 'Haz click en cada capa para ver el detalle' : 'Click each layer to see details';

    diagram.innerHTML = `
      <p class="ai-flow-label" style="margin-bottom:16px">↓ ${inputLabel}</p>
      ${layers.map((layer, i) => `
        <div class="ai-layer reveal" data-index="${i}" tabindex="0" role="button" aria-expanded="false">
          <div class="ai-layer-badge">${layer.num}</div>
          <div class="ai-layer-main">
            <div class="ai-layer-name">${layer.name}</div>
            <div class="ai-layer-short">${layer.short}</div>
          </div>
          <i class="uil uil-angle-down ai-layer-expand-icon"></i>
          <div class="ai-layer-detail">${layer.detail}</div>
        </div>
        ${i < layers.length - 1 ? '<div class="ai-connector"></div>' : ''}
      `).join('')}
      <p class="ai-flow-label" style="margin-top:16px">↓ ${outputLabel}</p>
      <p style="text-align:center;font-size:12px;color:var(--text-muted);margin-top:8px">${clickHint}</p>
    `;

    // Toggle detail on click
    diagram.querySelectorAll('.ai-layer').forEach(el => {
      const toggle = () => {
        const isActive = el.classList.contains('active');
        // close all
        diagram.querySelectorAll('.ai-layer.active').forEach(a => {
          a.classList.remove('active');
          a.setAttribute('aria-expanded', 'false');
        });
        if (!isActive) {
          el.classList.add('active');
          el.setAttribute('aria-expanded', 'true');
        }
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
  }

  /* ---------- INIT ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    // Render diagram immediately (static)
    renderDiagram();

    // Fetch stats
    fetch(STATS_URL)
      .then(r => r.json())
      .then(stats => {
        renderMetrics(stats);
        renderChangelog(stats);
        // Re-run reveal observer for newly created cards
        if (typeof initReveal === 'function') initReveal();
        observeCounters();
      })
      .catch(() => {
        // Fallback: render with hardcoded defaults
        renderMetrics({
          appointments_total: 251, appointments_this_month: 38,
          active_tenants: 4, tests_total: 1600,
          rls_policies: 59, rls_tables: 32,
          edge_functions: 9, anti_hallucination_layers: 6,
          anti_hallucination_mechanisms: 13, ci_checks: 147,
          uptime_pct: 99.8, last_updated: new Date().toISOString(),
          last_commit_msg: 'Production release',
        });
        observeCounters();
      });
  });
})();
