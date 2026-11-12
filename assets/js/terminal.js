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
        { t: 'output', v: '3+ years shipping AI products to production — and keeping them there.' },
        { t: 'output', v: 'Backend Developer at Complexity (Texas, US) and founder of Cronix,' },
        { t: 'output', v: 'a 24/7 multi-tenant SaaS managing 250+ real appointments' },
        { t: 'output', v: 'autonomously via a custom orchestration engine (no framework)' },
        { t: 'output', v: 'with anti-hallucination architecture — WhatsApp, voice and' },
        { t: 'output', v: 'phone-call agents plus a Next.js dashboard in 6 languages.' },
        { t: 'empty' },
        { t: 'muted',  v: 'Core stack: TypeScript · Node.js · Python · PostgreSQL · NestJS · Serverless' },
        { t: 'empty' },
      ],
      skills: [
        { t: 'accent', v: 'Technical Skills' },
        { t: 'empty' },
        { t: 'output', v: '  AI          LangGraph · RAG · pgvector · Anti-Hallucination' },
        { t: 'output', v: '              LLM-as-a-Judge · DeepEval · LangSmith · Langfuse · MCP' },
        { t: 'output', v: '              Voice AI · Pipecat Flows · WebRTC · STT/TTS · Structured Outputs' },
        { t: 'output', v: '              Groq · DeepSeek · Gemini · Deepgram · OpenRouter · Vercel AI SDK' },
        { t: 'output', v: '  Harness     Claude Code · Codex · Herdr · Orca · Gentle AI · Engram · MCP' },
        { t: 'output', v: '  Languages   TypeScript · Node.js · Python · Deno' },
        { t: 'output', v: '  Frameworks  NestJS · FastAPI · Express · Next.js 15 · React 19' },
        { t: 'output', v: '  Data        PostgreSQL · Elasticsearch · Redis · BullMQ · Prisma · TypeORM' },
        { t: 'output', v: '              Supabase · Neon · pgvector · RLS · Multi-tenant' },
        { t: 'output', v: '  Auth        JWT · OAuth 2.0 · WebAuthn · Passkeys · RBAC · HMAC' },
        { t: 'output', v: '  Testing     Vitest · pytest · Playwright · pgTAP · k6' },
        { t: 'output', v: '  Security    CodeQL · OWASP ZAP · Trivy · gitleaks · Auditing' },
        { t: 'output', v: '  Cloud       AWS (EC2 · S3 · ECR · CloudWatch · Secrets Manager · RDS)' },
        { t: 'output', v: '  DevOps      Docker · GitHub Actions · CI/CD · Vercel · Render · Sentry · Resend' },
        { t: 'empty' },
      ],
      experience: [
        { t: 'accent', v: 'Work Experience' },
        { t: 'empty' },
        { t: 'output', v: '  Backend Developer' },
        { t: 'muted',  v: '  Complexity (Texas, US · Remote) · Jul 2026 – Present' },
        { t: 'output', v: '  Project Factory: B2B company directory + admin panel + mobile app.' },
        { t: 'output', v: '  Audited the backend and led the approved remediation plan to completion:' },
        { t: 'output', v: '  circular deps 31 → 0 · 330 use cases on hexagonal architecture.' },
        { t: 'output', v: '  700+ tickets · 1,050+ merged PRs · 20+ releases in three months.' },
        { t: 'output', v: '  Unit suites 20 → 1,000+ · every PR validated in ~6 min.' },
        { t: 'output', v: '  "Claim your company" GTM backend + AI-assisted company loading.' },
        { t: 'output', v: '  AI extraction engine with evals and traces in Langfuse.' },
        { t: 'output', v: '  RLS 0 → 63 tables (pgTAP) · data-exposure report closed in <4 h (AWS).' },
        { t: 'empty' },
        { t: 'output', v: '  Software Development Lead · Backend / Full-Stack Developer' },
        { t: 'muted',  v: '  IBIME Connect (Institutional platform) · Jan 2025 – Jul 2026' },
        { t: 'muted',  v: '  Lead: Feb 2026 – Jul 2026 · Backend / Full-Stack: Jan 2025 – Feb 2026' },
        { t: 'output', v: '  Led software development: stack, architecture and quality standards.' },
        { t: 'output', v: '  Built end-to-end digital platform for a public library network' },
        { t: 'output', v: '  with AI assistant, 5-layer anti-hallucination engine, RAG + pgvector.' },
        { t: 'output', v: '  React frontend on hexagonal architecture, shared Zod contracts, 700+ tests.' },
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
        { t: 'output',  v: '               Multi-tenant SaaS — WhatsApp, voice & call AI agents, 250+ appointments' },
        { t: 'empty' },
        { t: 'output',  v: '  [BETA]       Voice Call Agent' },
        { t: 'output',  v: '               Real-time voice agent that books into Cronix (Python, Pipecat Flows)' },
        { t: 'output',  v: '               Works end to end; phone line pending a Venezuelan number' },
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
        { t: 'muted',   v: '  [CHALLENGE]  Frontier BOG26 — "La caja negra" (hackathon)' },
        { t: 'output',  v: '               Reverse-engineered an unknown HTTP service; exact replica on Railway' },
        { t: 'output',  v: '               84 experiments replayed as equivalence tests · differential fuzzing' },
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
        { t: 'output', v: '  • Cross-tenant hole in 13 DB functions found, reproduced and closed' },
        { t: 'output', v: '  • 4 payment methods that cannot double-charge on a repeated webhook' },
        { t: 'empty' },
        { t: 'accent', v: '  Dashboard' },
        { t: 'output', v: '  • Next.js 15 (App Router · Server Actions · SSR) · PWA · 6 languages' },
        { t: 'output', v: '  • Real-time calendar, financial summary and PDF reports' },
        { t: 'empty' },
        { t: 'accent', v: '  AI Architecture' },
        { t: 'output', v: '  • Custom orchestration engine — no framework' },
        { t: 'output', v: '  • 6-layer anti-hallucination / ~13 mechanisms' },
        { t: 'output', v: '  • 2-turn confirmation gate before mutations' },
        { t: 'output', v: '  • Function calling restricted to declared args only' },
        { t: 'output', v: '  • LLM-as-judge evaluation suite (DeepEval) in CI' },
        { t: 'output', v: '  • Multi-tenant tracing → LangSmith · p50/p95 dashboard' },
        { t: 'empty' },
        { t: 'accent', v: '  Voice Call Agent' },
        { t: 'output', v: '  • Real-time calls: Python · Pipecat Flows · Deepgram · WebRTC / Twilio' },
        { t: 'output', v: '  • The model talks; code decides every fact and every write' },
        { t: 'output', v: '  • Signed HMAC API · idempotency · slot lock against double booking' },
        { t: 'output', v: '  • 1.00 on the golden dataset · first token in 391 ms (p50)' },
        { t: 'empty' },
        { t: 'accent', v: '  Stack' },
        { t: 'muted',  v: '  Node.js · TypeScript · Deno · Python · Supabase · PostgreSQL RLS' },
        { t: 'muted',  v: '  Next.js 15 · Pipecat Flows · Groq · Deepgram · DeepEval · LangSmith' },
        { t: 'muted',  v: '  Redis · QStash · WebAuthn/Passkeys · Vercel' },
        { t: 'muted',  v: '  PayPal · NOWPayments · Pago Móvil · Binance' },
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
        { t: 'output', v: 'Más de 3 años llevando productos de IA a producción — y manteniéndolos ahí.' },
        { t: 'output', v: 'Backend Developer en Complexity (Texas, EE.UU.) y fundador de Cronix,' },
        { t: 'output', v: 'SaaS multi-tenant 24/7 que gestiona 250+ citas reales de forma' },
        { t: 'output', v: 'autónoma con motor de orquestación propio (sin framework)' },
        { t: 'output', v: 'y arquitectura anti-alucinación — agentes de WhatsApp, voz y' },
        { t: 'output', v: 'llamadas, más un panel en Next.js en 6 idiomas.' },
        { t: 'empty' },
        { t: 'muted',  v: 'Stack: TypeScript · Node.js · Python · PostgreSQL · NestJS · Serverless' },
        { t: 'empty' },
      ],
      skills: [
        { t: 'accent', v: 'Habilidades Técnicas' },
        { t: 'empty' },
        { t: 'output', v: '  IA           LangGraph · RAG · pgvector · Anti-Alucinación' },
        { t: 'output', v: '               LLM-as-a-Judge · DeepEval · LangSmith · Langfuse · MCP' },
        { t: 'output', v: '               Voice AI · Pipecat Flows · WebRTC · STT/TTS · Structured Outputs' },
        { t: 'output', v: '               Groq · DeepSeek · Gemini · Deepgram · OpenRouter · Vercel AI SDK' },
        { t: 'output', v: '  Harness      Claude Code · Codex · Herdr · Orca · Gentle AI · Engram · MCP' },
        { t: 'output', v: '  Lenguajes    TypeScript · Node.js · Python · Deno' },
        { t: 'output', v: '  Frameworks   NestJS · FastAPI · Express · Next.js 15 · React 19' },
        { t: 'output', v: '  Datos        PostgreSQL · Elasticsearch · Redis · BullMQ · Prisma · TypeORM' },
        { t: 'output', v: '               Supabase · Neon · pgvector · RLS · Multi-tenant' },
        { t: 'output', v: '  Auth         JWT · OAuth 2.0 · WebAuthn · Passkeys · RBAC · HMAC' },
        { t: 'output', v: '  Testing      Vitest · pytest · Playwright · pgTAP · k6' },
        { t: 'output', v: '  Seguridad    CodeQL · OWASP ZAP · Trivy · gitleaks · Auditoría' },
        { t: 'output', v: '  Cloud        AWS (EC2 · S3 · ECR · CloudWatch · Secrets Manager · RDS)' },
        { t: 'output', v: '  DevOps       Docker · GitHub Actions · CI/CD · Vercel · Render · Sentry · Resend' },
        { t: 'empty' },
      ],
      experience: [
        { t: 'accent', v: 'Experiencia Laboral' },
        { t: 'empty' },
        { t: 'output', v: '  Backend Developer' },
        { t: 'muted',  v: '  Complexity (Texas, EE.UU. · Remoto) · Jul 2026 – Presente' },
        { t: 'output', v: '  Proyecto Factory: directorio B2B de empresas + panel admin + app móvil.' },
        { t: 'output', v: '  Audité el backend y dirigí hasta cerrarlo el plan de remediación aprobado:' },
        { t: 'output', v: '  dependencias circulares 31 → 0 · 330 casos de uso en arquitectura hexagonal.' },
        { t: 'output', v: '  700+ tickets · 1,050+ PRs integrados · 20+ releases en tres meses.' },
        { t: 'output', v: '  Suites unitarias 20 → 1,000+ · cada PR validado en ~6 min.' },
        { t: 'output', v: '  Backend de "Reclama tu empresa" (GTM) + carga de empresas asistida por IA.' },
        { t: 'output', v: '  Motor de extracción con IA con evals y trazas en Langfuse.' },
        { t: 'output', v: '  RLS 0 → 63 tablas (pgTAP) · reporte de exposición de datos cerrado en <4 h (AWS).' },
        { t: 'empty' },
        { t: 'output', v: '  Coordinador de Desarrollo de Software · Backend / Full-Stack Developer' },
        { t: 'muted',  v: '  IBIME Connect (Plataforma institucional) · Ene 2025 – Jul 2026' },
        { t: 'muted',  v: '  Coordinador: Feb 2026 – Jul 2026 · Backend / Full-Stack: Ene 2025 – Feb 2026' },
        { t: 'output', v: '  Dirigí el desarrollo de software: stack, arquitectura y estándares de calidad.' },
        { t: 'output', v: '  Plataforma digital de punta a punta para red de bibliotecas públicas' },
        { t: 'output', v: '  con asistente IA, motor anti-alucinación 5 capas, RAG + pgvector.' },
        { t: 'output', v: '  Frontend React en arquitectura hexagonal, contratos Zod compartidos, 700+ tests.' },
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
        { t: 'output',  v: '                   SaaS multi-tenant — agentes IA de WhatsApp, voz y llamadas, 250+ citas' },
        { t: 'empty' },
        { t: 'output',  v: '  [BETA]           Voice Call Agent' },
        { t: 'output',  v: '                   Agente de voz en tiempo real que agenda en Cronix (Pipecat Flows)' },
        { t: 'output',  v: '                   Funciona de punta a punta; falta el número telefónico venezolano' },
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
        { t: 'muted',   v: '  [RETO TÉCNICO]   Frontier BOG26 — "La caja negra" (hackathon)' },
        { t: 'output',  v: '                   Ingeniería inversa de un servicio HTTP; réplica exacta en Railway' },
        { t: 'output',  v: '                   84 experimentos como tests de equivalencia · fuzzing diferencial' },
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
        { t: 'output', v: '  • Agujero entre negocios en 13 funciones de BD hallado, reproducido y cerrado' },
        { t: 'output', v: '  • 4 métodos de pago a prueba de cobros duplicados por webhook repetido' },
        { t: 'empty' },
        { t: 'accent', v: '  Panel' },
        { t: 'output', v: '  • Next.js 15 (App Router · Server Actions · SSR) · PWA · 6 idiomas' },
        { t: 'output', v: '  • Calendario en tiempo real, resumen financiero y reportes en PDF' },
        { t: 'empty' },
        { t: 'accent', v: '  Arquitectura IA' },
        { t: 'output', v: '  • Motor de orquestación propio — sin framework' },
        { t: 'output', v: '  • Arquitectura determinista de 6 capas / ~13 mecanismos' },
        { t: 'output', v: '  • Confirmation-gate de 2 turnos antes de mutaciones' },
        { t: 'output', v: '  • Function calling restringido a args declarados' },
        { t: 'output', v: '  • Suite de evaluación LLM-as-judge (DeepEval) en CI' },
        { t: 'output', v: '  • Tracing multi-tenant → LangSmith · dashboard p50/p95' },
        { t: 'empty' },
        { t: 'accent', v: '  Agente de llamadas' },
        { t: 'output', v: '  • Llamadas en tiempo real: Python · Pipecat Flows · Deepgram · WebRTC / Twilio' },
        { t: 'output', v: '  • El modelo conversa; el código decide cada dato y cada escritura' },
        { t: 'output', v: '  • API firmada HMAC · idempotencia · bloqueo contra doble reserva' },
        { t: 'output', v: '  • 1.00 en el dataset golden · primer token en 391 ms (p50)' },
        { t: 'empty' },
        { t: 'accent', v: '  Stack' },
        { t: 'muted',  v: '  Node.js · TypeScript · Deno · Python · Supabase · PostgreSQL RLS' },
        { t: 'muted',  v: '  Next.js 15 · Pipecat Flows · Groq · Deepgram · DeepEval · LangSmith' },
        { t: 'muted',  v: '  Redis · QStash · WebAuthn/Passkeys · Vercel' },
        { t: 'muted',  v: '  PayPal · NOWPayments · Pago Móvil · Binance' },
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
