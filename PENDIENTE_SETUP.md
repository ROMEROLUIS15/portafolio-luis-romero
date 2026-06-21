# Pasos pendientes — Agente conversacional RAG

Todo el código está implementado y los tests pasan. Lo que queda es configurar la infraestructura con tus credenciales.

**Costo total: $0** — Supabase free tier + Groq free tier. No necesitas tarjeta de crédito.

---

## Paso 1 — Crear proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto nuevo (si no tienes uno ya)
2. Guarda estas credenciales desde **Settings → API**:
   - `Project URL` → tu `SUPABASE_URL`
   - `anon public` → tu `SUPABASE_ANON_KEY`
   - `service_role secret` → tu `SUPABASE_SERVICE_ROLE_KEY`
3. Guarda el `Project Ref` (aparece en la URL: `supabase.com/dashboard/project/TU_PROJECT_REF`)

---

## Paso 2 — Habilitar extensión pgvector

En el dashboard de Supabase:
**Database → Extensions → busca "vector" → habilitar**

---

## Paso 3 — Instalar Supabase CLI y correr migraciones

```bash
# Instalar CLI (si no lo tienes)
npm install -g supabase

# Login
supabase login

# Vincular al proyecto
supabase link --project-ref TU_PROJECT_REF

# Correr las 3 migraciones
supabase db push
```

Esto crea las tablas `documents`, `rate_limits`, `chat_logs` y la función `match_documents`.

---

## Paso 4 — Obtener API key de Groq (gratis)

1. Ve a [console.groq.com](https://console.groq.com)
2. Crea una cuenta (gratis, sin tarjeta)
3. Copia tu API key

---

## Paso 5 — Configurar secrets en la Edge Function

```bash
supabase secrets set \
  GROQ_API_KEY=gsk_TU_GROQ_KEY \
  SUPABASE_URL=https://TU_PROJECT_REF.supabase.co \
  SUPABASE_ANON_KEY=TU_ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY \
  ALLOWED_ORIGINS=https://TU_DOMINIO.vercel.app
```

> Si tienes dominio propio además de Vercel, agrégalo separado por coma:
> `ALLOWED_ORIGINS=https://tu-portfolio.vercel.app,https://tudominio.com`

---

## Paso 6 — Desplegar la Edge Function

```bash
supabase functions deploy chat --project-ref TU_PROJECT_REF
```

La URL de la función quedará:
```
https://TU_PROJECT_REF.supabase.co/functions/v1/chat
```

---

## Paso 7 — Actualizar el endpoint en los dos HTML

Reemplaza `YOUR_SUPABASE_PROJECT` con tu project ref real en **ambos archivos**:

**`index.html`** (cerca del final, antes de `</body>`):
```html
<script>
  window.__CHAT_ENDPOINT__ = 'https://TU_PROJECT_REF.supabase.co/functions/v1/chat';
</script>
```

**`spanish/index.html`** (misma línea):
```html
<script>
  window.__CHAT_ENDPOINT__ = 'https://TU_PROJECT_REF.supabase.co/functions/v1/chat';
</script>
```

---

## Paso 8 — Instalar Deno y correr la ingesta

Instala Deno si no lo tienes: [deno.land](https://deno.land/#installation)

```bash
# En Windows PowerShell:
irm https://deno.land/install.ps1 | iex

# Luego correr la ingesta (desde la raíz del proyecto):
$env:SUPABASE_URL="https://TU_PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
$env:SUPABASE_ANON_KEY="TU_ANON_KEY"

deno run --allow-read --allow-net --allow-env scripts/ingest.ts
```

Esto procesa tus CVs en PDF y `cronix-stats.json` y los carga al vector store.
Verás logs como:
```
[ingest] ✓ Ingested 12/12 chunks for LuisRomero_AIEngineer-Backend_2026_EN.pdf
[ingest] ✓ Ingested 10/10 chunks for LuisRomero_AIEngineer-Backend_2026_ES.pdf
[ingest] ✓ Ingested 4/4 chunks for cronix-stats.json
[ingest] ✓ Ingestion complete.
```

---

## Paso 9 — Deploy del portafolio

Haz push a `main` en GitHub. Vercel despliega automáticamente.

La burbuja de chat aparecerá en la esquina inferior derecha de tu portafolio en ambas versiones (EN y ES).

---

## Resumen de credenciales necesarias

| Credencial | Dónde obtenerla | Costo |
|---|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API | Gratis |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API | Gratis |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API | Gratis |
| `GROQ_API_KEY` | console.groq.com | Gratis |

**No se necesita ninguna API de pago.**

---

## Si algo falla

Consulta `CHAT_AGENT_SETUP.md` para troubleshooting detallado.
