# Luis Romero — AI Engineer & Backend Developer

Portfolio personal de [Luis Romero](https://www.linkedin.com/in/luis-romero-dev-back15), AI Engineer y Backend Developer con base en Barranquilla, Colombia. Construido con HTML/CSS/JS vanilla — sin frameworks. Incluye un **agente conversacional RAG** embebido en producción, un terminal interactivo CLI, y estadísticas en vivo de [Cronix](https://cronix-app.vercel.app) sincronizadas automáticamente desde su repositorio via GitHub Actions.

---

## Tabla de contenidos

- [Demo en vivo](#demo-en-vivo)
- [Características](#características)
- [Arquitectura del agente conversacional](#arquitectura-del-agente-conversacional)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Stack tecnológico](#stack-tecnológico)
- [Setup local](#setup-local)
- [Agente conversacional — Setup de infraestructura](#agente-conversacional--setup-de-infraestructura)
- [Tests](#tests)
- [GitHub Actions — Sincronización de Cronix Stats](#github-actions--sincronización-de-cronix-stats)
- [Spec-Driven Development](#spec-driven-development)
- [Variables de entorno](#variables-de-entorno)

---

## Demo en vivo

🌐 EN: [portafolio-luis-romero.vercel.app](https://portafolio-luis-romero.vercel.app)  
🌐 ES: `/spanish/index.html`

---

## Características

### Portafolio

- **Bilingüe** — versión completa en inglés (`/`) y español (`/spanish`)
- **Dark / Light mode** con persistencia en `localStorage`
- **Secciones**: Hero, About, Experience (timeline), Projects, Cronix Live Stats, Terminal CLI, Contact
- **CV descargable** en PDF, EN y ES, via modal
- **Responsive** — mobile-first, breakpoints en 600 / 768 / 900 / 1024 / 1280px
- **Scroll reveal** con `IntersectionObserver` — sin librerías externas
- **Formulario de contacto** via [FormSubmit](https://formsubmit.co) — sin backend propio

### Agente conversacional RAG

- **Burbuja flotante** en esquina inferior derecha, presente en ambas versiones del portafolio
- **Pipeline RAG completo**: query → embedding → búsqueda vectorial → LLM → respuesta con fuentes
- **Bilingüe**: detecta `document.documentElement.lang` en el momento exacto del envío
- **Anti-hallucination**: el LLM solo responde usando los chunks recuperados del vector store
- **Rate limiting**: 10 req/min por IP con ventana deslizante
- **Retry exponencial**: 2 reintentos (1s, 2s) ante errores 5xx o timeout
- **Privacy-first**: solo se almacena el hash SHA-256 del mensaje, nunca el texto plano
- **Fallback graceful**: mensaje de contacto directo si el agente no está disponible

### Cronix Live Stats

- Métricas reales de Cronix cargadas desde `cronix-stats.json`
- Changelog de los últimos 9 commits del proyecto
- Diagrama interactivo de la arquitectura anti-alucinación de 6 capas
- Actualización automática via GitHub Actions webhook desde el repo de Cronix

### Terminal CLI interactivo

Comandos disponibles: `help`, `about`, `skills`, `projects`, `experience`, `contact`, `clear`, `exit`

---

## Arquitectura del agente conversacional

El agente es un sistema RAG (Retrieval-Augmented Generation) con dos capas:

```
Visitor
  │
  ▼
chat-widget.js          ← Vanilla JS IIFE, burbuja flotante, i18n EN/ES
  │  POST /functions/v1/chat
  │  Headers: X-Session-Token (UUID v4)
  │  Body: { message, lang }
  ▼
Edge Function (Deno)    ← Supabase, serverless, runs on Deno
  │
  ├─ CORS validation    ← Origen permitido en ALLOWED_ORIGINS
  ├─ Session token      ← UUID v4 RFC 4122
  ├─ Message validation ← 1-500 chars
  ├─ Rate limiting      ← 10 req/min/IP via tabla rate_limits
  ├─ Embedding          ← Supabase gte-small (384 dims, GRATIS)
  ├─ Vector search      ← match_documents() RPC, top-5, cosine similarity
  │   └─ Threshold 0.70 ← Si max(similarity) < 0.70 → fallback sin LLM
  ├─ System prompt      ← Instrucciones anti-alucinación + chunks contexto
  ├─ Groq LLM           ← openai/gpt-oss-120b, temp=0.3, max_completion_tokens=1024
  ├─ Log (async)        ← SHA-256 del mensaje, nunca texto plano
  └─ Response           ← { answer: string, sources: string[] }
```

### Base de conocimiento

Los datos ingestados en el vector store provienen de:

| Fuente | Idioma | Descripción |
|--------|--------|-------------|
| `LuisRomero_AIEngineer-Backend_2026_EN.pdf` | EN | CV completo en inglés |
| `LuisRomero_AIEngineer-Backend_2026_ES.pdf` | ES | CV completo en español |
| `cronix-stats.json` | EN | Métricas y changelog de Cronix |

Chunking: ventana deslizante de ~500 tokens con solapamiento de ~50 tokens.

### Propiedades de corrección verificadas

El diseño del agente define 13 propiedades formales de corrección. Las críticas, verificadas con property-based testing (fast-check):

| # | Propiedad | Verifica |
|---|-----------|---------|
| 1 | Mensajes fuera de rango (vacío o >500 chars) → HTTP 422, sin llamar al LLM | Req 4.4 |
| 3 | Session token inválido → HTTP 400 en todo caso | Req 4.3 |
| 4 | Si max(similarity) < 0.70 → fallback sin invocar LLM | Req 3.2, 3.3 |
| 5 | System prompt refleja el idioma de la petición | Req 6.1, 6.2 |
| 6 | System prompt siempre contiene instrucciones de restricción sobre Luis Romero | Req 3.4 |
| 7 | Solo hash SHA-256 almacenado, nunca texto plano | Req 8.2 |
| 10 | Sugerencias ocultas tras primer intercambio | Req 7.5 |
| 11 | Exactamente 3 intentos antes de mostrar fallback definitivo | Req 5.1, 5.4 |
| 13 | `lang` transmitido refleja `document.documentElement.lang` en el momento exacto del envío | Req 6.3 |

---

## Estructura del proyecto

```
portafolio_lerh/
│
├── index.html                          # Versión EN
├── spanish/
│   └── index.html                      # Versión ES
│
├── assets/
│   ├── css/
│   │   ├── style.css                   # Estilos principales + variables CSS
│   │   ├── terminal.css                # Terminal CLI
│   │   ├── casestudy.css               # Drawer case study Cronix
│   │   ├── cronix-live.css             # Sección Cronix Live Stats
│   │   └── chat-widget.css             # Agente conversacional
│   ├── js/
│   │   ├── main.js                     # Nav, dark mode, scroll reveal, typed.js
│   │   ├── terminal.js                 # Terminal CLI interactivo
│   │   ├── casestudy.js                # Drawer case study Cronix
│   │   ├── cronix-live.js              # Métricas + AI diagram desde cronix-stats.json
│   │   ├── chat-widget.js              # Agente conversacional (IIFE vanilla JS)
│   │   └── chat-widget.test.js         # Tests Vitest — 18 tests, Properties 10/11/13
│   └── images/
│       ├── profile-without-bg.png
│       ├── cronix.jpeg
│       ├── cmms hidrobombas merida.jpeg
│       ├── ibime-connet.jpeg
│       ├── x clone-reto tecnico.jpeg
│       ├── logo rl.jpeg
│       ├── LuisRomero_AIEngineer-Backend_2026_EN.pdf   # Base de conocimiento RAG
│       └── LuisRomero_AIEngineer-Backend_2026_ES.pdf   # Base de conocimiento RAG
│
├── supabase/
│   ├── functions/
│   │   └── chat/
│   │       ├── index.ts                # Edge Function — wiring: env, clientes, orquestación
│   │       ├── lib.ts                  # Lógica pura, sin efectos de módulo — lo que se testea
│   │       ├── chat.test.ts            # Tests Deno — 31 unitarios + PBT sobre lib.ts
│   │       ├── e2e.test.ts             # Tests Deno — 8 E2E contra el proyecto desplegado
│   │       └── .env.example            # Variables de entorno para desarrollo local
│   ├── migrations/
│   │   ├── 001_create_documents.sql    # Tabla vector store + HNSW index + RLS
│   │   ├── 002_create_rate_limits_and_logs.sql  # Rate limiting + observabilidad
│   │   └── 003_match_documents_fn.sql  # RPC match_documents con priorización por idioma
│   └── tests/
│       └── rls.test.sql                # pgTAP — RLS policies + match_documents
│
├── scripts/
│   └── ingest.ts                       # Deno — ingesta PDFs + cronix-stats → pgvector
│
├── .kiro/
│   └── specs/
│       └── portfolio-conversational-agent/
│           ├── requirements.md         # Requisitos funcionales con acceptance criteria
│           ├── design.md               # Arquitectura, modelos, propiedades de corrección
│           └── tasks.md                # Plan de implementación — 13 tareas, completadas
│
├── .github/
│   └── workflows/
│       ├── update-cronix-stats.yml     # Webhook desde repo Cronix → actualiza stats
│       └── supabase-keepalive.yml      # Ping diario — evita que el free tier se pause
│
├── cronix-stats.json                   # Métricas en vivo de Cronix
├── .env.example                        # Plantilla de variables de entorno
├── .gitignore
├── package.json                        # Scripts de test + dev dependencies
├── vitest.config.js                    # Config Vitest + jsdom
├── CHAT_AGENT_SETUP.md                 # Guía detallada de setup del agente
└── PENDIENTE_SETUP.md                  # Checklist de pasos de infraestructura
```

---

## Stack tecnológico

### Portafolio

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML5, CSS3, JavaScript ES2022 vanilla |
| Fuentes | Inter + Space Grotesk (Google Fonts) |
| Iconos | Unicons, Font Awesome 6 |
| Animaciones | CSS custom + IntersectionObserver API |
| Formulario | FormSubmit (sin backend) |
| Typed effect | Typed.js 2.0 |
| Deploy | Vercel |

### Agente conversacional

> **Sin frameworks de orquestación de IA.** El pipeline RAG completo está implementado desde cero: sin LangChain, sin LangGraph, sin LlamaIndex. Solo SDKs oficiales y `fetch` nativo de Deno llamando directamente a las APIs. Mismo patrón que Cronix.

| Capa | Tecnología |
|------|-----------|
| Widget frontend | Vanilla JS IIFE — zero dependencies |
| Edge Function | Deno / TypeScript (Supabase) — pipeline RAG custom |
| Embeddings | Supabase `gte-small` — 384 dims (**gratis**) via `fetch` |
| Vector DB | PostgreSQL + pgvector, índice HNSW |
| LLM | Groq `openai/gpt-oss-120b`, fallback `openai/gpt-oss-20b` — temp 0.3, via `fetch` (**gratis**) |
| Rate limiting | PostgreSQL `rate_limits` — ventana deslizante 60s |
| Logging | PostgreSQL `chat_logs` — SHA-256, RLS |
| Ingesta | Deno script — `unpdf` + `@supabase/supabase-js` |

### Automatización

| Herramienta | Uso |
|-------------|-----|
| GitHub Actions | Webhook desde Cronix → actualiza `cronix-stats.json` |
| GitHub Actions | Keep-alive diario contra Supabase (`supabase-keepalive.yml`) |

El free tier de Supabase pausa un proyecto tras ~7 días sin actividad. Un proyecto
pausado pierde su registro DNS y el widget falla con *"the agent is currently
unavailable"* hasta restaurarlo a mano. El workflow ejecuta un `SELECT` trivial
sobre `documents` cada día: la consulta tiene que llegar a Postgres para contar
como actividad — la raíz de la API REST devuelve 401 y no sirve.

Corre a diario, no semanalmente: GitHub retrasa los cron bajo carga y un intervalo
de 7 días no deja margen para una ejecución perdida. Falla en rojo ante cualquier
respuesta que no sea 200, para que un proyecto pausado se note.

> GitHub desactiva los workflows programados en repos sin actividad durante 60
> días. Si ocurre, se reactiva desde la pestaña Actions.

### Testing

| Herramienta | Alcance | Tests |
|-------------|---------|-------|
| Vitest + jsdom | Chat Widget | 18 |
| Deno test | Edge Function — unitarios + PBT sobre `lib.ts` | 31 |
| pgTAP | SQL — RLS de las 4 tablas + `match_documents` | 13 |
| Deno test | E2E contra el proyecto desplegado | 8 |
| fast-check | Property-based testing en Widget y Edge Function | — |

```bash
npm test          # widget
npm run test:edge # edge function (unitarios)
npm run test:db   # pgTAP — requiere `supabase start` (Docker)
npm run test:e2e  # e2e — requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run test:all  # los tres primeros
```

La lógica pura de la Edge Function vive en `supabase/functions/chat/lib.ts`, sin
efectos de módulo (no lee `Deno.env`, no crea clientes). `index.ts` la cablea al
runtime y `chat.test.ts` importa **exactamente las mismas funciones** — nada se
reimplementa del lado del test.

---

## Setup local

El portafolio es HTML estático — no requiere build.

```bash
git clone https://github.com/ROMEROLUIS15/portafolio-luis-romero.git
cd portafolio-luis-romero
```

Abre `index.html` directamente en el navegador, o usa Live Server en VS Code.

Para correr los tests del widget:

```bash
npm install
npm test
```

---

## Agente conversacional — Setup de infraestructura

> **Costo total: $0** — Supabase free tier + Groq free tier.

### 1. Requisitos previos

- Cuenta en [Supabase](https://supabase.com) (gratis)
- Cuenta en [Groq](https://console.groq.com) (gratis, sin tarjeta)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Deno](https://deno.land) (para el script de ingesta)

### 2. Base de datos

```bash
# Habilitar extensión pgvector en el dashboard de Supabase:
# Database → Extensions → vector → Enable

supabase login
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

Las 3 migraciones crean:
- `documents` — vector store con embeddings de 384 dims + índice HNSW + RLS
- `rate_limits` — rate limiting por IP con ventana deslizante
- `chat_logs` — observabilidad con RLS (solo service_role puede insertar)
- `match_documents()` — RPC con priorización por idioma

### 3. Secrets de la Edge Function

Los valores viven en `.env` (ignorado por git). Nunca los escribas en un comando
ni en un archivo versionado:

```bash
cp .env.example .env      # y rellena tus claves

supabase secrets set GROQ_API_KEY="$(grep '^GROQ_API_KEY=' .env | cut -d= -f2-)"
supabase secrets set ALLOWED_ORIGINS="$(grep '^ALLOWED_ORIGINS=' .env | cut -d= -f2-)"
```

Solo esos dos son secrets de usuario. `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY` las inyecta la plataforma automáticamente en las Edge
Functions y **no se pueden definir a mano**: la API rechaza cualquier nombre con
prefijo `SUPABASE_`. Al rotar esas claves, el valor nuevo se propaga solo.

`setup.bat` y `run_ingest.bat` leen `.env` con el mismo criterio y abortan si
falta alguna variable.

### 4. Deploy de la Edge Function

```bash
supabase functions deploy chat --project-ref TU_PROJECT_REF
```

### 5. Ingesta del knowledge base

```bash
# PowerShell (Windows)
$env:SUPABASE_URL="https://TU_PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
$env:SUPABASE_ANON_KEY="eyJ..."

deno run --allow-read --allow-net --allow-env scripts/ingest.ts
```

### 6. Actualizar el endpoint en los HTML

En `index.html` y `spanish/index.html`, reemplazar `YOUR_SUPABASE_PROJECT`:

```html
<script>
  window.__CHAT_ENDPOINT__ = 'https://TU_PROJECT_REF.supabase.co/functions/v1/chat';
</script>
```

Ver [CHAT_AGENT_SETUP.md](./CHAT_AGENT_SETUP.md) para troubleshooting detallado.

---

## Tests

### Widget (Vitest + jsdom + fast-check)

```bash
npm test
```

18 tests — 100% passing:

| Suite | Tests |
|-------|-------|
| DOM rendering | 8 — bubble, panel open/close, Escape, click outside, welcome msg, history |
| Localisation | 3 — EN/ES placeholder, EN/ES suggested questions |
| Suggested questions | 2 — count, suggestion click sends message |
| Rate limit UI | 1 — 429 disables input + shows countdown |
| Property 10 | 1 PBT — suggestions hidden after ≥1 exchange (10 runs) |
| Property 11 | 1 PBT — exactly 3 fetch attempts before fallback (4 runs × use500/network) |
| Property 13 | 2 PBT — lang matches DOM at send time (100 runs each) |

### Edge Function (Deno test)

```bash
npm run test:edge
```

31 tests sobre `lib.ts`: validación de mensajes y tokens, umbral de recuperación,
system prompt (idioma, anti-alucinación, prohibición de markdown), `stripMetaPrefix`,
claves de caché, guard de origen y la cadena de fallback de Groq con `fetch` inyectado.

`supabase/functions/deno.json` acota el proyecto a Deno; sin él, Deno sube al
`package.json` raíz y falla al resolver `npm:@types/node`.

### SQL (pgTAP)

```bash
supabase start     # requiere Docker
npm run test:db
```

13 assertions. Cubre las cuatro tablas: `documents` (lectura pública, escritura
denegada), `chat_logs`, `chat_cache` y `rate_limits` (las tres deny-all para `anon`),
más los límites de `match_documents`.

> Un `SELECT` bajo RLS deny-all **no lanza excepción**: devuelve cero filas. Los
> tests lo afirman así, contando filas en vez de esperar un error.

### E2E (Deno test contra el proyecto desplegado)

```bash
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
npm run test:e2e
```

8 tests. Se saltan solos si faltan esas variables.

> **Por qué no basta con comprobar `HTTP 200`.** El pipeline falla abierto: si la
> `service_role` deja de ser válida, el rate limiting, la caché y el logging fallan
> en silencio y la función sigue respondiendo `200`. Ocurrió en producción y no se
> detectó. Por eso el E2E afirma que **aparece una fila nueva en `chat_logs`**, que
> la respuesta no viene vacía y que no contiene markdown.

---

## GitHub Actions — Keep-alive de Supabase

`.github/workflows/supabase-keepalive.yml` corre a diario (06:17 UTC) y hace un
`SELECT id FROM documents LIMIT 1` vía PostgREST. Evita que el free tier pause el
proyecto por inactividad.

Requiere dos secrets de repositorio: `SUPABASE_URL` y `SUPABASE_ANON_KEY`. La clave
anon es pública por diseño —va en el navegador, protegida por RLS— pero se mantiene
fuera del YAML de todas formas.

Se puede lanzar a mano desde la pestaña Actions (`workflow_dispatch`).

---

## GitHub Actions — Sincronización de Cronix Stats

El archivo `cronix-stats.json` se actualiza automáticamente cuando hay un nuevo commit en el repositorio de Cronix, via webhook de `repository_dispatch`.

**Flujo:**

```
Cronix repo — nuevo commit
  │
  └─ Workflow en Cronix: curl POST a GitHub API
       │  event_type: cronix-stats-update
       │  payload: { appointments_total, active_tenants, last_commit_msg, ... }
       ▼
  portafolio — workflow update-cronix-stats.yml
       │
       ├─ Rebuild cronix-stats.json con nuevas métricas
       ├─ Mantiene últimas 9 entradas del changelog
       └─ git commit + push [skip ci]
```

**Para configurar en el repo de Cronix:**

1. Crear secret `PORTFOLIO_PAT` con un Personal Access Token con permiso `repo`
2. Agregar al workflow de Cronix:

```yaml
- name: Notify portfolio
  run: |
    curl -X POST \
      -H "Authorization: token ${{ secrets.PORTFOLIO_PAT }}" \
      -H "Accept: application/vnd.github.v3+json" \
      https://api.github.com/repos/ROMEROLUIS15/portafolio-luis-romero/dispatches \
      -d '{
        "event_type": "cronix-stats-update",
        "client_payload": {
          "appointments_total": 251,
          "appointments_this_month": 38,
          "active_tenants": 4,
          "tests_total": 1000,
          "last_commit_msg": "${{ github.event.head_commit.message }}",
          "commit_type": "feat",
          "version": "1.0.0"
        }
      }'
```

---

## Spec-Driven Development

Este proyecto sigue un proceso de spec-driven development. Los artefactos de diseño están versionados en `.kiro/specs/portfolio-conversational-agent/`:

| Archivo | Contenido |
|---------|-----------|
| `requirements.md` | 8 requisitos funcionales con user stories y acceptance criteria formales |
| `design.md` | Arquitectura completa, diagramas de flujo, modelos de datos, interfaces de componentes, 13 propiedades de corrección especificadas antes de escribir código |
| `tasks.md` | Plan de implementación con dependency graph en waves, trazabilidad requisito → tarea → test |

El proceso seguido:

```
requirements.md  →  design.md  →  tasks.md  →  implementación  →  tests
     (qué)           (cómo)       (plan)         (código)        (verificación)
```

---

## Variables de entorno

Ver `.env.example` en la raíz para la lista completa. Para desarrollo local del agente, copiar `supabase/functions/chat/.env.example` a `supabase/functions/chat/.env.local`.

| Variable | Servicio | Dónde obtenerla |
|----------|----------|-----------------|
| `SUPABASE_URL` | Supabase | Dashboard → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase | Dashboard → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Dashboard → Settings → API → service_role |
| `GROQ_API_KEY` | Groq | console.groq.com → API Keys |
| `ALLOWED_ORIGINS` | CORS | Tu dominio de Vercel, e.g. `https://tu-portfolio.vercel.app` |

> **Nunca** committear archivos `.env.local`. El `.gitignore` ya los excluye.

---

## Contacto

**Luis Romero**  
AI Engineer & Backend Developer  
📧 lueduar15@gmail.com  
💼 [LinkedIn](https://www.linkedin.com/in/luis-romero-dev-back15)  
🐙 [GitHub](https://github.com/ROMEROLUIS15)  
💬 [WhatsApp](https://wa.me/573244926589)
