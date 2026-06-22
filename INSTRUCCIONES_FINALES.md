# Instrucciones Finales — Configuración del Agente Conversacional RAG

## 📋 Resumen

Todo el código está listo. Solo necesitas **una PAT (Personal Access Token)** para completar la configuración.

---

## 🔑 Paso 1: Generar tu Personal Access Token (PAT)

1. Ve a: **https://supabase.com/dashboard/account/tokens**
2. Haz clic en **New API Key** o el botón para crear un nuevo token
3. Configuración:
   - **Project**: `dsrxcqjivhvhvpqumcvb`
   - **Role**: `service_role` (esto es crucial para tener todos los privilegios)
   - **Name**: `portfolio-chat-config` (o cualquier nombre que te guste)
4. Haz clic en **Create**
5. **Copia la clave generada** (se ve como `eyJhbGciOiJIUzI1NiIs...`)

> ⚠️ **IMPORTANTE**: Guarda esta clave en un lugar seguro. Es tu contraseña para Supabase.

---

## ⚡ Paso 2: Ejecutar el script de configuración

Una vez tengas la PAT, ejecuta este comando:

```bash
setup.bat TU_PAT_AQUI
```

Este script hará automáticamente:
1. ✅ Login en Supabase con tu PAT
2. ✅ Vincular al proyecto `dsrxcqjivhvhvpqumcvb`
3. ✅ Configurar todos los secrets (GROQ_API_KEY, SUPABASE_URL, etc.)
4. ✅ Desplegar la Edge Function `chat`
5. ✅ Ejecutar la ingesta de datos (PDFs + cronix-stats.json)

---

## 📊 Paso 3: Verificar que todo funcione

Después de ejecutar `setup.bat`:

1. Visita tu portafolio: **https://portafolio-luis-romero.vercel.app**
2. Debería aparecer una burbuja de chat en la esquina inferior derecha
3. Haz una pregunta en inglés: "What is Luis's experience with LangGraph?"
4. Haz una pregunta en español: "¿Cuál es la experiencia de Luis con LangGraph?"
5. Verifica que las respuestas provengan de tu CV (RAG funcionando)

---

## 🔍 Verificación manual (opcional)

Si quieres verificar manualmente, puedes hacerlo desde el dashboard:

### Verificar documentos en la base de datos
1. Ve a [Supabase Dashboard → SQL Editor](https://supabase.com/dashboard/project/dsrxcqjivhvhvpqumcvb/sql)
2. Ejecuta:
```sql
SELECT COUNT(*) as total_documents FROM documents;
SELECT source, COUNT(*) as chunks FROM documents GROUP BY source;
```

**Resultado esperado:**
- Total: ~26+ documentos
- LuisRomero_AIEngineer-Backend_2026_EN.pdf: ~12 chunks
- LuisRomero_AIEngineer-Backend_2026_ES.pdf: ~10 chunks
- cronix-stats.json: ~4 chunks

### Verificar logs de la Edge Function
1. Ve a [Edge Functions → chat → Logs](https://supabase.com/dashboard/project/dsrxcqjivhvhvpqumcvb/functions/chat/logs)
2. Verifica que las llamadas recientes tengan status 200

---

## ❌ Solución de problemas comunes

### Error: "Your account does not have the necessary privileges"

**Causa**: Estás usando la `anon key` en lugar de la `service_role key` (o tu PAT no tiene los privilegios correctos)

**Solución**: 
1. Verifica que en el dashboard de tokens seleccionaste **Role: service_role**
2. Verifica que copiaste la clave completa (empieza con `eyJ...`)
3. Intenta generar una nueva PAT

---

### Error: "Failed to set secret" o "403 Forbidden"

**Causa**: La PAT no tiene permisos para configurar secrets

**Solución**:
1. Elimina la PAT actual
2. Genera una nueva en [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
3. Asegúrate de seleccionar **Role: service_role**
4. Usa la nueva PAT en `setup.bat`

---

### Error: "GROQ_API_KEY is invalid"

**Causa**: La API key de Groq no es válida o está incompleta

**Solución**:
1. Verifica que la key empiece con `gsk_`
2. Verifica que la key no tenga espacios al inicio o final
3. Verifica que la key esté completa (debería ser una cadena larga)

---

### Error: "pgvector extension not found"

**Causa**: La extensión pgvector no está habilitada en el proyecto

**Solución**:
1. Ve a [Supabase Dashboard → Database → Extensions](https://supabase.com/dashboard/project/dsrxcqjivhvhvpqumcvb/database/extensions)
2. Busca "vector"
3. Haz clic en **Enable**

---

## 📝 Archivos útiles

| Archivo | Descripción |
|---------|-------------|
| `setup.bat` | Script de configuración completa (usa este!) |
| `run_ingest.bat` | Solo ejecuta la ingesta de datos |
| `CONFIGURATION_CHECKLIST.md` | Lista de verificación detallada |
| `PENDIENTE_SETUP.md` | Guía de setup paso a paso |
| `CHAT_AGENT_SETUP.md` | Documentación técnica completa |

---

## ✅ Checklist final

Después de ejecutar `setup.bat`, verifica:

- [ ] PAT generada y usada correctamente
- [ ] GROQ_API_KEY configurada en la Edge Function
- [ ] Edge Function desplegada (status 200 en logs)
- [ ] ~26+ documentos en la base de datos
- [ ] Widget visible en el portafolio
- [ ] Preguntas en inglés funcionan
- [ ] Preguntas en español funcionan

---

**¡Listo! Con una PAT, todo se configura con un solo comando.**

**Comando mágico:**
```bash
setup.bat TU_PAT_AQUI
```
