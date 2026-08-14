/* ============================================
   TERMINAL — vanilla JS
   ============================================ */
(function () {
  const lang = document.documentElement.lang === 'es' ? 'es' : 'en';

  /* ---------- CONTENT ---------- */
  const content = {
    en: {
      welcome: [
        { t: 'muted', v: '╭─────────────────────────────────────────╮' },
        { t: 'muted', v: '│   Luis Romero · Portfolio Terminal v1.0  │' },
        { t: 'muted', v: '╰─────────────────────────────────────────╯' },
        { t: 'output', v: "Hi! I'm an interactive terminal. Here's what you can explore:" },
        { t: 'empty' },
        { t: 'output', v: '  whoami       Who is Luis Romero' },
        { t: 'output', v: '  skills       Technical skill set' },
        { t: 'output', v: '  experience   Work experience' },
        { t: 'output', v: '  projects     Recent projects' },
        { t: 'output', v: '  cronix       Deep dive into Cronix' },
        { t: 'output', v: '  contact      Contact information' },
        { t: 'output', v: '  open [name]  Open a link  (github · linkedin · cronix · whatsapp)' },
        { t: 'output', v: '  clear        Clear the screen' },
        { t: 'empty' },
        { t: 'muted',  v: '  ↑ ↓  navigate history  ·  type and press Enter to run' },
        { t: 'empty' },
      ],
      help: [
        { t: 'accent', v: 'Available commands:' },
        { t: 'empty' },
        { t: 'output', v: '  whoami       Who is Luis Romero' },
        { t: 'output', v: '  skills       Technical skill set' },
        { t: 'output', v: '  experience   Work experience' },
        { t: 'output', v: '  projects     Recent projects' },
        { t: 'output', v: '  cronix       Deep dive into Cronix' },
        { t: 'output', v: '  contact      Contact information' },
        { t: 'output', v: '  open [name]  Open a link (github|linkedin|cronix|whatsapp)' },
        { t: 'output', v: '  clear        Clear the terminal' },
        { t: 'output', v: '  exit         Close the terminal' },
        { t: 'empty' },
      ],
      whoami: [
        { t: 'accent', v: 'Luis Romero' },
        { t: 'output', v: 'AI Engineer & Backend Developer' },
        { t: 'output', v: 'Mérida, Venezuela' },
        { t: 'empty' },
        { t: 'output', v: '3 years shipping AI products to production — and keeping them there.' },
        { t: 'output', v: 'Backend Developer at Complexity (Texas, US) and founder of Cronix,' },
        { t: 'output', v: 'a 24/7 multi-tenant SaaS managing 250+ real appointments' },
        { t: 'output', v: 'autonomously via a custom orchestration engine (no framework)' },
        { t: 'output', v: 'with anti-hallucination architecture.' },
        { t: 'empty' },
        { t: 'muted',  v: 'Core stack: TypeScript · Node.js · Python · PostgreSQL · NestJS · Serverless' },
        { t: 'empty' },
      ],
      skills: [
        { t: 'accent', v: 'Technical Skills' },
        { t: 'empty' },
        { t: 'output', v: '  AI          LangGraph · RAG · pgvector · Anti-Hallucination' },
        { t: 'output', v: '              LLM-as-a-Judge · DeepEval · LangSmith · MCP · Voice AI' },
        { t: 'output', v: '              Groq · DeepSeek · Gemini · Deepgram' },
        { t: 'output', v: '  Languages   TypeScript · Node.js · Python · Deno' },
        { t: 'output', v: '  Frameworks  NestJS · FastAPI · Express · Next.js 15 · React 19' },
        { t: 'output', v: '  Data        PostgreSQL · Elasticsearch · Redis · Prisma · TypeORM' },
        { t: 'output', v: '              Supabase · Neon · pgvector · RLS · Multi-tenant' },
        { t: 'output', v: '  Auth        JWT · OAuth 2.0 · WebAuthn · Passkeys · RBAC' },
        { t: 'output', v: '  Testing     Vitest · pytest · Playwright · pgTAP · k6' },
        { t: 'output', v: '  Security    CodeQL · OWASP ZAP · Trivy · gitleaks · Auditing' },
        { t: 'output', v: '  DevOps      Docker · GitHub Actions · CI/CD · Vercel · Render · Sentry' },
        { t: 'empty' },
      ],
      experience: [
        { t: 'accent', v: 'Work Experience' },
        { t: 'empty' },
        { t: 'output', v: '  Backend Developer' },
        { t: 'muted',  v: '  Complexity (Texas, US · Remote) · Jul 2026 – Present' },
        { t: 'output', v: '  Mobile app backend: REST + OpenAPI, WebSockets, job queues and' },
        { t: 'output', v: '  full-text search over 26 domain modules (NestJS, TypeORM, Elasticsearch).' },
        { t: 'output', v: '  Audited the backend and I am running the approved remediation plan.' },
        { t: 'empty' },
        { t: 'output', v: '  Software Development Lead · Backend / Full-Stack Developer' },
        { t: 'muted',  v: '  IBIME Connect (Institutional platform) · Jan 2025 – Jul 2026' },
        { t: 'output', v: '  Built end-to-end digital platform for a public library network' },
        { t: 'output', v: '  with AI assistant, 5-layer anti-hallucination engine, RAG + pgvector.' },
        { t: 'empty' },
        { t: 'output', v: '  Backend Developer' },
        { t: 'muted',  v: '  Kiura (Teletherapy platform) · Apr 2024 – Dec 2024' },
        { t: 'output', v: '  Subscription payments, real-time chat (Socket.IO), Agora RTC video,' },
        { t: 'output', v: '  JWT + Google OAuth with RBAC over 26-entity MySQL domain.' },
        { t: 'empty' },
      ],
      projects: [
        { t: 'accent', v: 'Recent Projects' },
        { t: 'empty' },
        { t: 'success', v: '  [LIVE]       Cronix' },
        { t: 'output',  v: '               Multi-tenant SaaS — AI agent for WhatsApp & voice, 250+ appointments' },
        { t: 'empty' },
        { t: 'success', v: '  [LIVE]       Motosmax Cordialidad' },
        { t: 'output',  v: '               Workshop SaaS — WhatsApp + back-office agents (Python, FastAPI, LangGraph)' },
        { t: 'empty' },
        { t: 'success', v: '  [LIVE]       Advanced Product Search API' },
        { t: 'output',  v: '               Search & discovery — Elasticsearch 8, BM25, facets (Complexity challenge)' },
        { t: 'empty' },
        { t: 'success', v: '  [LIVE]       CMMS Hidrobombas Mérida' },
        { t: 'output',  v: '               Industrial CMMS — LangGraph multi-agent, RAG, React 19 PWA' },
        { t: 'empty' },
        { t: 'success', v: '  [LIVE]       IBIME Library Platform' },
        { t: 'output',  v: '               Institutional AI platform — semantic search, pgvector, LangGraph' },
        { t: 'empty' },
        { t: 'muted',   v: '  [CHALLENGE]  Twitter/X Clone' },
        { t: 'output',  v: '               Hardened auth, SSE real-time, 3-tier test pyramid (202 tests)' },
        { t: 'empty' },
        { t: 'muted',   v: '  [CHALLENGE]  CEPLAN Access Portal — AHVA' },
        { t: 'output',  v: '               ASP.NET Core .NET 8, Clean Architecture, EF Core, PBKDF2 auth' },
        { t: 'empty' },
        { t: 'muted',   v: "  Type 'cronix' for a deep dive into the flagship project." },
        { t: 'empty' },
      ],
      cronix: [
        { t: 'accent', v: '⚡ Cronix — Flagship Project' },
        { t: 'muted',  v: '   cronix-app.vercel.app · Jan 2026 – Present' },
        { t: 'empty' },
        { t: 'output', v: '  Multi-tenant SaaS for appointment-based businesses.' },
        { t: 'output', v: '  Built and deployed end-to-end autonomously.' },
        { t: 'empty' },
        { t: 'accent', v: '  Stats' },
        { t: 'output', v: '  • 250+ real appointments managed autonomously, 24/7' },
        { t: 'output', v: '  • 1,600+ tests (Vitest · Playwright E2E · pgTAP)' },
        { t: 'output', v: '  • 59 RLS policies / 32 tables validated with 147 pgTAP asserts' },
        { t: 'output', v: '  • 9 serverless Edge Functions (Deno)' },
        { t: 'empty' },
        { t: 'accent', v: '  AI Architecture' },
        { t: 'output', v: '  • Custom orchestration engine — no framework' },
        { t: 'output', v: '  • 6-layer anti-hallucination / ~13 mechanisms' },
        { t: 'output', v: '  • 2-turn confirmation gate before mutations' },
        { t: 'output', v: '  • Function calling restricted to declared args only' },
        { t: 'output', v: '  • LLM-as-judge evaluation suite (DeepEval) in CI' },
        { t: 'output', v: '  • Multi-tenant tracing → LangSmith · p50/p95 dashboard' },
        { t: 'empty' },
        { t: 'accent', v: '  Stack' },
        { t: 'muted',  v: '  Node.js · TypeScript · Deno · Supabase · PostgreSQL RLS' },
        { t: 'muted',  v: '  Groq · Deepgram · DeepEval · LangSmith · Redis · QStash' },
        { t: 'muted',  v: '  WebAuthn/Passkeys · PayPal · NOWPayments · Binance · Vercel' },
        { t: 'empty' },
      ],
      contact: [
        { t: 'accent', v: 'Contact' },
        { t: 'empty' },
        { t: 'output', v: '  Email      lueduar15@gmail.com' },
        { t: 'output', v: '  WhatsApp   +58 424 709 2980' },
        { t: 'output', v: '  LinkedIn   linkedin.com/in/hernandezrs955' },
        { t: 'output', v: '  GitHub     github.com/ROMEROLUIS15' },
        { t: 'output', v: '  Cronix     cronix-app.vercel.app' },
        { t: 'empty' },
        { t: 'muted',  v: "  Type 'open github' or 'open linkedin' to navigate directly." },
        { t: 'empty' },
      ],
      notfound: (cmd) => [
        { t: 'error',  v: `  command not found: ${cmd}` },
        { t: 'muted',  v: "  Type 'help' to see available commands." },
        { t: 'empty' },
      ],
      exit: [
        { t: 'output', v: 'Closing terminal... Thanks for visiting! 👋' },
        { t: 'empty' },
      ],
    },
    es: {
      welcome: [
        { t: 'muted', v: '╭─────────────────────────────────────────╮' },
        { t: 'muted', v: '│   Luis Romero · Terminal Portafolio v1.0 │' },
        { t: 'muted', v: '╰─────────────────────────────────────────╯' },
        { t: 'output', v: '¡Hola! Soy una terminal interactiva. Esto es lo que puedes explorar:' },
        { t: 'empty' },
        { t: 'output', v: '  whoami       Quién es Luis Romero' },
        { t: 'output', v: '  skills       Habilidades técnicas' },
        { t: 'output', v: '  experience   Experiencia laboral' },
        { t: 'output', v: '  projects     Proyectos recientes' },
        { t: 'output', v: '  cronix       Deep dive en Cronix' },
        { t: 'output', v: '  contact      Información de contacto' },
        { t: 'output', v: '  open [name]  Abrir enlace  (github · linkedin · cronix · whatsapp)' },
        { t: 'output', v: '  clear        Limpiar la pantalla' },
        { t: 'empty' },
        { t: 'muted',  v: '  ↑ ↓  navegar historial  ·  escribe y presiona Enter para ejecutar' },
        { t: 'empty' },
      ],
      help: [
        { t: 'accent', v: 'Comandos disponibles:' },
        { t: 'empty' },
        { t: 'output', v: '  whoami       Quién es Luis Romero' },
        { t: 'output', v: '  skills       Habilidades técnicas' },
        { t: 'output', v: '  experience   Experiencia laboral' },
        { t: 'output', v: '  projects     Proyectos recientes' },
        { t: 'output', v: '  cronix       Deep dive en Cronix' },
        { t: 'output', v: '  contact      Información de contacto' },
        { t: 'output', v: '  open [name]  Abrir enlace (github|linkedin|cronix|whatsapp)' },
        { t: 'output', v: '  clear        Limpiar la terminal' },
        { t: 'output', v: '  exit         Cerrar la terminal' },
        { t: 'empty' },
      ],
      whoami: [
        { t: 'accent', v: 'Luis Romero' },
        { t: 'output', v: 'AI Engineer y Desarrollador Backend' },
        { t: 'output', v: 'Mérida, Venezuela' },
        { t: 'empty' },
        { t: 'output', v: '3 años llevando productos de IA a producción — y manteniéndolos ahí.' },
        { t: 'output', v: 'Backend Developer en Complexity (Texas, EE.UU.) y fundador de Cronix,' },
        { t: 'output', v: 'SaaS multi-tenant 24/7 que gestiona 250+ citas reales de forma' },
        { t: 'output', v: 'autónoma con motor de orquestación propio (sin framework)' },
        { t: 'output', v: 'y arquitectura anti-alucinación.' },
        { t: 'empty' },
        { t: 'muted',  v: 'Stack: TypeScript · Node.js · Python · PostgreSQL · NestJS · Serverless' },
        { t: 'empty' },
      ],
      skills: [
        { t: 'accent', v: 'Habilidades Técnicas' },
        { t: 'empty' },
        { t: 'output', v: '  IA           LangGraph · RAG · pgvector · Anti-Alucinación' },
        { t: 'output', v: '               LLM-as-a-Judge · DeepEval · LangSmith · MCP · Voice AI' },
        { t: 'output', v: '               Groq · DeepSeek · Gemini · Deepgram' },
        { t: 'output', v: '  Lenguajes    TypeScript · Node.js · Python · Deno' },
        { t: 'output', v: '  Frameworks   NestJS · FastAPI · Express · Next.js 15 · React 19' },
        { t: 'output', v: '  Datos        PostgreSQL · Elasticsearch · Redis · Prisma · TypeORM' },
        { t: 'output', v: '               Supabase · Neon · pgvector · RLS · Multi-tenant' },
        { t: 'output', v: '  Auth         JWT · OAuth 2.0 · WebAuthn · Passkeys · RBAC' },
        { t: 'output', v: '  Testing      Vitest · pytest · Playwright · pgTAP · k6' },
        { t: 'output', v: '  Seguridad    CodeQL · OWASP ZAP · Trivy · gitleaks · Auditoría' },
        { t: 'output', v: '  DevOps       Docker · GitHub Actions · CI/CD · Vercel · Render · Sentry' },
        { t: 'empty' },
      ],
      experience: [
        { t: 'accent', v: 'Experiencia Laboral' },
        { t: 'empty' },
        { t: 'output', v: '  Backend Developer' },
        { t: 'muted',  v: '  Complexity (Texas, EE.UU. · Remoto) · Jul 2026 – Presente' },
        { t: 'output', v: '  Backend de app móvil: REST + OpenAPI, WebSockets, colas de trabajos y' },
        { t: 'output', v: '  búsqueda full-text sobre 26 módulos (NestJS, TypeORM, Elasticsearch).' },
        { t: 'output', v: '  Audité el backend y ejecuto el plan de remediación aprobado.' },
        { t: 'empty' },
        { t: 'output', v: '  Software Development Lead · Backend / Full-Stack Developer' },
        { t: 'muted',  v: '  IBIME Connect (Plataforma institucional) · Ene 2025 – Jul 2026' },
        { t: 'output', v: '  Plataforma digital de punta a punta para red de bibliotecas públicas' },
        { t: 'output', v: '  con asistente IA, motor anti-alucinación 5 capas, RAG + pgvector.' },
        { t: 'empty' },
        { t: 'output', v: '  Backend Developer' },
        { t: 'muted',  v: '  Kiura (Plataforma de teleterapia) · Abr 2024 – Dic 2024' },
        { t: 'output', v: '  Pagos por suscripción, chat en tiempo real (Socket.IO), video Agora RTC,' },
        { t: 'output', v: '  JWT + Google OAuth con RBAC sobre dominio MySQL de 26 entidades.' },
        { t: 'empty' },
      ],
      projects: [
        { t: 'accent', v: 'Proyectos Recientes' },
        { t: 'empty' },
        { t: 'success', v: '  [EN PRODUCCIÓN]  Cronix' },
        { t: 'output',  v: '                   SaaS multi-tenant — agente IA para WhatsApp y voz, 250+ citas' },
        { t: 'empty' },
        { t: 'success', v: '  [EN PRODUCCIÓN]  Motosmax Cordialidad' },
        { t: 'output',  v: '                   SaaS de taller — agentes WhatsApp y back office (Python, FastAPI)' },
        { t: 'empty' },
        { t: 'success', v: '  [EN PRODUCCIÓN]  Advanced Product Search API' },
        { t: 'output',  v: '                   Búsqueda y descubrimiento — Elasticsearch 8, BM25, facetas' },
        { t: 'empty' },
        { t: 'success', v: '  [EN PRODUCCIÓN]  CMMS Hidrobombas Mérida' },
        { t: 'output',  v: '                   CMMS industrial — LangGraph multi-agente, RAG, PWA React 19' },
        { t: 'empty' },
        { t: 'success', v: '  [EN PRODUCCIÓN]  Plataforma IBIME' },
        { t: 'output',  v: '                   Plataforma IA institucional — búsqueda semántica, pgvector' },
        { t: 'empty' },
        { t: 'muted',   v: '  [RETO TÉCNICO]   Clon de Twitter/X' },
        { t: 'output',  v: '                   Auth endurecida, SSE tiempo real, pirámide de 202 tests' },
        { t: 'empty' },
        { t: 'muted',   v: '  [RETO TÉCNICO]   Portal de acceso CEPLAN — AHVA' },
        { t: 'output',  v: '                   ASP.NET Core .NET 8, Clean Architecture, EF Core, auth PBKDF2' },
        { t: 'empty' },
        { t: 'muted',   v: "  Escribe 'cronix' para un deep dive en el proyecto principal." },
        { t: 'empty' },
      ],
      cronix: [
        { t: 'accent', v: '⚡ Cronix — Proyecto Principal' },
        { t: 'muted',  v: '   cronix-app.vercel.app · Ene 2026 – Presente' },
        { t: 'empty' },
        { t: 'output', v: '  SaaS multi-tenant para negocios con citas.' },
        { t: 'output', v: '  Construido y desplegado de punta a punta de forma autónoma.' },
        { t: 'empty' },
        { t: 'accent', v: '  Estadísticas' },
        { t: 'output', v: '  • 250+ citas reales gestionadas autónomamente, 24/7' },
        { t: 'output', v: '  • 1,600+ tests (Vitest · Playwright E2E · pgTAP)' },
        { t: 'output', v: '  • 59 políticas RLS / 32 tablas validadas con 147 asserts pgTAP' },
        { t: 'output', v: '  • 9 Edge Functions serverless (Deno)' },
        { t: 'empty' },
        { t: 'accent', v: '  Arquitectura IA' },
        { t: 'output', v: '  • Motor de orquestación propio — sin framework' },
        { t: 'output', v: '  • Arquitectura determinista de 6 capas / ~13 mecanismos' },
        { t: 'output', v: '  • Confirmation-gate de 2 turnos antes de mutaciones' },
        { t: 'output', v: '  • Function calling restringido a args declarados' },
        { t: 'output', v: '  • Suite de evaluación LLM-as-judge (DeepEval) en CI' },
        { t: 'output', v: '  • Tracing multi-tenant → LangSmith · dashboard p50/p95' },
        { t: 'empty' },
        { t: 'accent', v: '  Stack' },
        { t: 'muted',  v: '  Node.js · TypeScript · Deno · Supabase · PostgreSQL RLS' },
        { t: 'muted',  v: '  Groq · Deepgram · DeepEval · LangSmith · Redis · QStash' },
        { t: 'muted',  v: '  WebAuthn/Passkeys · PayPal · NOWPayments · Binance · Vercel' },
        { t: 'empty' },
      ],
      contact: [
        { t: 'accent', v: 'Contacto' },
        { t: 'empty' },
        { t: 'output', v: '  Correo     lueduar15@gmail.com' },
        { t: 'output', v: '  WhatsApp   +58 424 709 2980' },
        { t: 'output', v: '  LinkedIn   linkedin.com/in/hernandezrs955' },
        { t: 'output', v: '  GitHub     github.com/ROMEROLUIS15' },
        { t: 'output', v: '  Cronix     cronix-app.vercel.app' },
        { t: 'empty' },
        { t: 'muted',  v: "  Escribe 'open github' o 'open linkedin' para navegar directo." },
        { t: 'empty' },
      ],
      notfound: (cmd) => [
        { t: 'error',  v: `  comando no encontrado: ${cmd}` },
        { t: 'muted',  v: "  Escribe 'help' para ver los comandos disponibles." },
        { t: 'empty' },
      ],
      exit: [
        { t: 'output', v: 'Cerrando terminal... ¡Gracias por visitar! 👋' },
        { t: 'empty' },
      ],
    },
  };

  const links = {
    github:   'https://github.com/ROMEROLUIS15',
    linkedin: 'https://www.linkedin.com/in/hernandezrs955',
    cronix:   'https://cronix-app.vercel.app',
    whatsapp: 'https://wa.me/584247092980',
  };

  /* ---------- STATE ---------- */
  let history = [];
  let historyIndex = -1;

  /* ---------- DOM ---------- */
  const output = document.getElementById('terminalOutput');
  const input  = document.getElementById('terminalInput');
  if (!output || !input) return;

  const c = content[lang];

  /* ---------- RENDER ---------- */

  // A two-column row: two leading spaces, a term, then the gutter before its
  // description — "  whoami       Who is Luis Romero". The width up to the
  // description is measured per line because the three tables in this file do
  // not share one: help aligns at 15 characters, skills at 14, contact at 13.
  const COLUMN_ROW = /^ {2}\S.*?  +(?=\S)/;

  function printLines(lines) {
    lines.forEach(line => {
      const el = document.createElement('div');
      el.className = `t-line ${line.t}`;
      el.textContent = line.v || '';

      // On a phone the description wraps. Without a hanging indent the second
      // line starts at column 0, where it reads as the next command rather
      // than as the rest of this one.
      if (line.t === 'output') {
        const gutter = COLUMN_ROW.exec(line.v || '');
        if (gutter) {
          el.classList.add('row');
          el.style.setProperty('--col', `${gutter[0].length}ch`);
        }
      }

      output.appendChild(el);
    });
    output.scrollTop = output.scrollHeight;
  }

  function printCmd(cmd) {
    const el = document.createElement('div');
    el.className = 't-line cmd';
    el.textContent = `❯ ${cmd}`;
    output.appendChild(el);
  }

  /* ---------- COMMANDS ---------- */
  function run(raw) {
    const parts = raw.trim().toLowerCase().split(/\s+/);
    const cmd   = parts[0];
    const arg   = parts[1];

    if (!cmd) return;

    printCmd(raw.trim());
    history.unshift(raw.trim());
    historyIndex = -1;

    switch (cmd) {
      case 'help':
      case 'ls':
      case 'dir':
        printLines(c.help);
        break;
      case 'whoami':     printLines(c.whoami);      break;
      case 'skills':     printLines(c.skills);      break;
      case 'experience': printLines(c.experience);  break;
      case 'projects':   printLines(c.projects);    break;
      case 'cronix':     printLines(c.cronix);      break;
      case 'contact':    printLines(c.contact);     break;
      case 'clear':
        output.innerHTML = '';
        break;
      case 'exit':
        printLines(c.exit);
        setTimeout(() => {
          const contact = document.getElementById('contact');
          if (contact) contact.scrollIntoView({ behavior: 'smooth' });
        }, 1200);
        break;
      case 'open':
        if (arg && links[arg]) {
          window.open(links[arg], '_blank', 'noopener');
          printLines([
            { t: 'success', v: `  Opening ${arg}...` },
            { t: 'empty' },
          ]);
        } else {
          const available = Object.keys(links).join(' | ');
          printLines([
            { t: 'error', v: `  Usage: open [${available}]` },
            { t: 'empty' },
          ]);
        }
        break;
      default:
        printLines(c.notfound(cmd));
    }
  }

  /* ---------- INPUT EVENTS ---------- */
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = input.value;
      input.value = '';
      run(val);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        input.value = history[historyIndex];
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = history[historyIndex];
      } else {
        historyIndex = -1;
        input.value = '';
      }
    }
  });

  // Click anywhere in terminal focuses input
  document.querySelector('.terminal-window')
    ?.addEventListener('click', () => input.focus());

  /* ---------- INIT ---------- */
  printLines(c.welcome);
  input.focus();
})();
