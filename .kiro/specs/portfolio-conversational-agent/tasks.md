# Implementation Plan: portfolio-conversational-agent

## Overview

Implementación incremental del agente conversacional RAG embebido en el portafolio. El plan sigue el orden natural de dependencias: esquema de base de datos → script de ingesta → Edge Function (backend RAG) → Chat Widget (frontend) → integración final en las páginas HTML. Las propiedades de corrección se validan con `fast-check` en cada capa a medida que se construye.

---

## Tasks

- [x] 1. Configurar estructura de directorios y esquema PostgreSQL
  - Crear los directorios `supabase/functions/chat/`, `supabase/migrations/`, `scripts/`, `supabase/tests/`
  - Escribir la migración SQL con las tablas `documents` (vector 1536, HNSW), `rate_limits` y `chat_logs` (con RLS)
  - Implementar la función RPC `match_documents` con priorización por idioma
  - Configurar las políticas RLS: lectura pública en `documents`, solo `service_role` en `chat_logs`
  - _Requirements: 2.5, 4.1, 4.4, 8.1, 8.4_

- [x] 2. Implementar el script de ingesta (`scripts/ingest.ts`)
  - [x] 2.1 Implementar el chunker de texto con ventana de tokens
    - Escribir la función `chunkText(text: string): string[]` que produce chunks de 200–500 tokens con 50 tokens de solapamiento
    - Usar un tokenizador basado en palabras/caracteres aproximado compatible con Deno
    - _Requirements: 2.1_

  - [ ]* 2.2 Escribir property test para el chunker (Property 9)
    - **Property 9: El chunker genera segmentos dentro del rango de tokens requerido**
    - **Validates: Requirement 2.1**
    - Usar `fast-check` vía `esm.sh` con `fc.string()` de longitud variable
    - Verificar que `length(chunk) ∈ [200, 500]` para todos los chunks y que los pares consecutivos comparten exactamente 50 tokens de solapamiento

  - [x] 2.3 Implementar extracción de texto de PDFs y procesamiento de `cronix-stats.json`
    - Integrar `unpdf` vía `esm.sh` para leer `assets/images/LuisRomero_AIEngineer-Backend_2026_EN.pdf` y `LuisRomero_AIEngineer-Backend_2026_ES.pdf`
    - Serializar los campos de `cronix-stats.json` (métricas + entradas de changelog) a texto plano
    - Manejar archivos ausentes con log de error y continuación (no abort)
    - _Requirements: 2.2, 2.4_

  - [x] 2.4 Implementar generación de embeddings y upsert en Vector Store
    - Generar embeddings en lotes de 20 usando `text-embedding-ada-002` vía OpenAI API
    - Hacer upsert en `documents` con metadatos: `source`, `lang`, `chunk_index`, `created_at`
    - Implementar retry (3 intentos con backoff) para fallos de API de embeddings
    - _Requirements: 2.3, 2.4_

  - [ ]* 2.5 Escribir property test de round-trip de embeddings (Property 8)
    - **Property 8: Round-trip de embeddings garantiza recuperabilidad de chunks**
    - **Validates: Requirement 2.3**
    - Para N chunks ingestados, verificar que `match_documents(embed(chunk_i))` retorna `chunk_i` como top-1 con similitud ≥ 0.99
    - Ejecutar contra una base de datos de test con datos fixtures (no producción)

- [x] 3. Checkpoint — Verificar que la ingesta corre sin errores
  - Ejecutar `deno run --allow-read --allow-net --allow-env scripts/ingest.ts` con datos reales
  - Confirmar que se insertan chunks con metadatos correctos en `documents`
  - Confirmar que `match_documents` retorna resultados para queries de prueba
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implementar la Edge Function — validaciones y rate limiting
  - [x] 4.1 Implementar la estructura base de la Edge Function con CORS y routing
    - Crear `supabase/functions/chat/index.ts` con handler principal `serve()`
    - Implementar CORS preflight (OPTIONS) con los headers correctos
    - Implementar validación de `Origin` contra lista de orígenes permitidos (dominio Vercel + localhost)
    - Retornar HTTP 403 para orígenes no permitidos con body vacío
    - _Requirements: 4.5_

  - [ ]* 4.2 Escribir property test de CORS (Property 12)
    - **Property 12: CORS rechaza cualquier origen no permitido**
    - **Validates: Requirement 4.5**
    - Generar con `fc.string()` valores de `Origin` arbitrarios, filtrar los permitidos
    - Verificar que el handler retorna HTTP 403 para cualquier origen no en la lista blanca

  - [x] 4.3 Implementar validación de `X-Session-Token` (UUID RFC 4122)
    - Escribir la función `isValidUUID(token: string): boolean` con regex RFC 4122
    - Retornar HTTP 400 con `{ error: "invalid_session_token" }` si el header está ausente o malformado
    - _Requirements: 4.3_

  - [ ]* 4.4 Escribir property test de session token (Property 3)
    - **Property 3: Session token inválido rechazado en todo caso**
    - **Validates: Requirement 4.3**
    - Generar strings arbitrarios que no sean UUIDs válidos con `fc.string()` + `.filter(s => !isValidUUID(s))`
    - Verificar HTTP 400 en todos los casos

  - [x] 4.5 Implementar validación del body del request (`message`, `lang`)
    - Parsear y validar que `message` sea string con 1–500 caracteres
    - Retornar HTTP 422 con `{ error: "invalid_message", max_length: 500 }` si falla
    - Normalizar `lang`: si el valor no es `"es"` ni `"en"`, usar `"en"` como default
    - _Requirements: 4.4, 6.4_

  - [ ]* 4.6 Escribir property test de validación de mensajes (Property 1)
    - **Property 1: Validación de mensajes rechaza entradas fuera de rango**
    - **Validates: Requirement 4.4**
    - Generar con `fc.oneof(fc.constant(''), fc.string({minLength: 501, maxLength: 1000}), fc.constant(undefined))`
    - Verificar HTTP 422 y que `mockEmbeddings` y `mockGroq` tienen 0 llamadas

  - [x] 4.7 Implementar lógica de rate limiting con ventana deslizante de 60 s
    - Leer IP desde header `X-Real-IP`
    - Implementar lógica de ventana deslizante en tabla `rate_limits`: reset si `now() - window_start > 60s`, incremento si no
    - Retornar HTTP 429 con `{ error: "rate_limit_exceeded", retry_after: N }` si `count > 10`
    - Calcular `retry_after` como `60 - EXTRACT(EPOCH FROM (now() - window_start))`
    - _Requirements: 4.1, 4.2_

  - [ ]* 4.8 Escribir property test de rate limiting (Property 2)
    - **Property 2: Rate limiting bloquea la petición número 11 en adelante por IP**
    - **Validates: Requirements 4.1, 4.2**
    - Simular N peticiones desde la misma IP con `fc.integer({min: 11, max: 50})`
    - Verificar HTTP 429 con `retry_after > 0` para petición 11+; verificar que peticiones 1–10 no retornan 429

- [x] 5. Checkpoint — Verificar todas las validaciones de la Edge Function
  - Ejecutar el suite de tests PBT con `deno test --allow-net supabase/functions/chat/`
  - Verificar que las Properties 1, 2, 3, 12 pasan con `numRuns: 100`
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implementar la Edge Function — pipeline RAG completo
  - [x] 6.1 Implementar generación de embedding de la query y recuperación de chunks
    - Llamar a OpenAI `text-embedding-ada-002` con el `message` del usuario
    - Llamar a `match_documents(embedding, lang, 5)` vía Supabase RPC
    - _Requirements: 3.1_

  - [x] 6.2 Implementar lógica de threshold de similitud y fallback fuera-de-contexto
    - Si `max(similarity) < 0.70` sobre los chunks recuperados, retornar HTTP 200 con mensaje de fallback localizado y `sources: []` sin invocar al LLM
    - Si `max(similarity) >= 0.70`, continuar al paso de construcción del prompt
    - _Requirements: 3.2, 3.3_

  - [ ]* 6.3 Escribir property test de threshold de similitud (Property 4)
    - **Property 4: Threshold de similitud determina la invocación al LLM**
    - **Validates: Requirements 3.2, 3.3**
    - Generar arrays de similarities con `fc.array(fc.float({min: 0, max: 0.699}), {minLength: 1, maxLength: 5})`
    - Verificar `assertSpyCalls(mockGroq, 0)` y `body.sources === []`

  - [x] 6.4 Implementar construcción del system prompt con restricciones y soporte bilingüe
    - Construir el system prompt incluyendo los chunks recuperados como contexto
    - Incluir instrucciones que restrinjan al LLM a responder solo sobre Luis Romero usando el contexto provisto
    - Prohibir explícitamente inventar datos no presentes en los chunks
    - Incluir instrucción de idioma en español si `lang === "es"`, en inglés si `lang === "en"`
    - _Requirements: 3.4, 6.1, 6.2_

  - [ ]* 6.5 Escribir property test del system prompt — restricciones (Property 6)
    - **Property 6: El system prompt siempre contiene instrucciones de restricción sobre Luis Romero**
    - **Validates: Requirement 3.4**
    - Para cualquier mensaje y lang, verificar que el system prompt construido contiene las instrucciones de restricción con `fc.string({minLength: 1, maxLength: 500})`

  - [ ]* 6.6 Escribir property test del system prompt — idioma (Property 5)
    - **Property 5: El system prompt siempre refleja el idioma de la petición**
    - **Validates: Requirements 6.1, 6.2, 6.4**
    - Generar `lang` con `fc.oneof(fc.constant('es'), fc.constant('en'), fc.string())`
    - Verificar instrucciones en español para `"es"`, en inglés para `"en"` y cualquier otro valor

  - [x] 6.7 Implementar llamada a Groq y construcción de la respuesta final
    - Llamar a Groq `llama3-70b-8192` con `temperature: 0.3` y `max_tokens: 512`
    - Retornar HTTP 200 con `{ answer: string, sources: string[] }` donde `sources` son los nombres de archivo de los chunks
    - Manejar error del LLM con HTTP 500 y `{ error: "internal_error" }` (sin exponer detalles)
    - _Requirements: 3.5, 3.6_

  - [x] 6.8 Implementar logging en `chat_logs` (fire-and-forget con privacidad)
    - Calcular SHA-256 hex del `message` usando `crypto.subtle.digest`
    - Insertar en `chat_logs`: `session_token`, `lang`, `message_hash`, `chunks_retrieved`, `response_time_ms`, `created_at`
    - Nunca almacenar el texto plano del mensaje
    - Manejar fallo de insert con `console.warn` sin interrumpir la respuesta
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 6.9 Escribir property test de privacidad del mensaje (Property 7)
    - **Property 7: Privacidad del mensaje — solo hash SHA-256 almacenado**
    - **Validates: Requirement 8.2**
    - Para `fc.string({minLength: 1, maxLength: 500})`, verificar que `insertPayload.message_hash === SHA256(message)` y que `JSON.stringify(insertPayload)` no contiene el texto plano

- [x] 7. Checkpoint — Verificar pipeline RAG completo con mocks
  - Ejecutar suite de tests de integración con mocks de OpenAI, Groq y Supabase
  - Verificar flujo completo: mensaje válido → embedding → `match_documents` → system prompt → Groq → respuesta JSON
  - Verificar los tests PBT de Properties 4, 5, 6, 7 con `numRuns: 100`
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implementar el Chat Widget (`assets/js/chat-widget.js`)
  - [x] 8.1 Implementar estructura DOM, estilos CSS inline y burbuja flotante
    - Crear el IIFE `chat-widget.js` que inyecta en el DOM el botón burbuja (`position: fixed; bottom: 24px; right: 24px`) y el panel de conversación (mínimo 340×480 px)
    - Usar variables CSS del portafolio (`--accent`, `--bg`, `--text`, `--surface`) para integración visual con ambos temas
    - Asegurar que el widget no interfiere con el scroll del portafolio
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 8.2 Implementar gestión de estado: apertura, cierre e historial de mensajes
    - Implementar `toggle()`: abrir/cerrar panel al hacer click en burbuja
    - Cerrar panel al presionar `Escape` o click fuera del panel, sin perder el historial
    - Gestionar historial de mensajes en memoria (máx. 20 visibles) con scroll interno
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 8.3 Implementar generación y persistencia del `session_token` en `sessionStorage`
    - Generar UUID v4 al iniciar la sesión y persistirlo en `sessionStorage`
    - Reutilizar el token existente si ya hay uno en `sessionStorage`
    - Incluir `X-Session-Token` en cada petición HTTP
    - _Requirements: 4.3_

  - [x] 8.4 Implementar detección de idioma y textos localizados de la UI
    - Leer `document.documentElement.lang` en el momento exacto del envío de cada mensaje
    - Mostrar todos los textos de interfaz en español si `lang === "es"`, en inglés si `lang === "en"`
    - _Requirements: 1.6, 6.3_

  - [x] 8.5 Implementar mensaje de bienvenida y preguntas sugeridas de onboarding
    - Mostrar mensaje de bienvenida del agente seguido de 3 preguntas sugeridas al abrir el widget por primera vez en la sesión
    - Mostrar preguntas en español ("¿Qué experiencia tiene Luis con LangGraph?", "¿Cuáles son las métricas reales de Cronix?", "¿Qué stack usa Luis para sistemas anti-alucinación?") o en inglés según el idioma
    - Al hacer click en una pregunta sugerida, insertarla en el campo de texto y enviarla automáticamente
    - Ocultar las preguntas sugeridas una vez que existe al menos 1 intercambio previo en la sesión
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 8.6 Implementar `sendMessage()` con lógica de fetch, retry exponencial y estados de UI
    - Enviar `POST /functions/v1/chat` con body `{ message, lang }` y headers `Content-Type`, `X-Session-Token`
    - Implementar `AbortController` con timeout de 8 segundos
    - Implementar retry exponencial: 1 s → 2 s → fallback definitivo (máximo 2 reintentos, 3 intentos totales)
    - Gestionar estados: `LOADING` (input deshabilitado, spinner) → `OPEN` (respuesta) → `ERROR_STATE` (retry)
    - _Requirements: 3.5, 5.4_

  - [x] 8.7 Implementar manejo de errores HTTP y mensajes de fallback localizados
    - HTTP 429: deshabilitar input por `retry_after` segundos con countdown visible
    - HTTP ≥ 500 o timeout: activar retry exponencial; tras 3 intentos fallidos mostrar mensaje de fallback localizado (ES/EN)
    - HTTP 400/422: mostrar mensaje de error inline en la interfaz, registrar en `console.error`
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 9. Checkpoint — Verificar el Chat Widget en aislamiento
  - Ejecutar tests de Vitest para el Chat Widget
  - Verificar: renderizado inicial, apertura/cierre, preguntas sugeridas, localización, retry exponencial, manejo de errores HTTP
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Escribir tests del Chat Widget con Vitest
  - [x] 10.1 Escribir tests de ejemplo para renderizado y comportamiento del widget
    - Test: burbuja visible en DOM tras cargar el script
    - Test: panel cerrado por defecto; se abre al hacer click; se cierra con Escape y click-outside
    - Test: historial de mensajes persiste al cerrar y reabrir el panel
    - Test: preguntas sugeridas visibles en primera apertura; ocultas tras primer intercambio
    - Test: textos en ES e EN según `document.documentElement.lang`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 10.2 Escribir property test de retry exhausto (Property 11)
    - **Property 11: Retry exhausto antes de mostrar fallback definitivo**
    - **Validates: Requirements 5.1, 5.4**
    - Con `fast-check` (Vitest), mockear `fetch` para que siempre retorne HTTP 500 o timeout
    - Verificar exactamente 3 llamadas a `fetch` antes de mostrar el mensaje de fallback
    - Verificar que el fallback NO aparece tras el intento 1 ni el 2

  - [ ]* 10.3 Escribir property test de transmisión del idioma (Property 13)
    - **Property 13: El widget transmite el lang del documento en el momento exacto del envío**
    - **Validates: Requirement 6.3**
    - Generar con `fc.oneof(fc.constant('es'), fc.constant('en'))` el valor de `document.documentElement.lang`
    - Verificar que el campo `lang` en el body de la petición HTTP es exactamente el valor leído del DOM al momento del envío

  - [ ]* 10.4 Escribir property test de preguntas sugeridas invisibles tras primer intercambio (Property 10)
    - **Property 10: Preguntas sugeridas invisibles tras primer intercambio**
    - **Validates: Requirement 7.5**
    - Simular N intercambios con `fc.integer({min: 1, max: 20})`
    - Verificar que el componente de preguntas sugeridas no está presente ni es visible en el DOM tras ≥ 1 intercambio

- [x] 11. Escribir tests SQL con pgTAP
  - [x] 11.1 Implementar tests pgTAP para RLS y función `match_documents`
    - Test: INSERT en `chat_logs` desde `anon` role lanza error de RLS
    - Test: INSERT en `chat_logs` desde `service_role` funciona correctamente
    - Test: `match_documents` retorna máximo 5 resultados
    - Test: `match_documents` prioriza chunks del idioma solicitado
    - Test: `documents` permite SELECT anónimo pero rechaza INSERT anónimo
    - _Requirements: 2.5, 8.4_

- [x] 12. Integrar el Chat Widget en ambas páginas HTML
  - Añadir `<script src="assets/js/chat-widget.js" defer></script>` antes de `</body>` en `index.html` (EN)
  - Añadir `<script src="../assets/js/chat-widget.js" defer></script>` antes de `</body>` en `spanish/index.html` (ES)
  - Verificar que el widget no produce conflictos de nombres de variables con los scripts existentes (`main.js`, `terminal.js`, `cronix-live.js`, `casestudy.js`)
  - _Requirements: 1.1, 1.5, 1.6_

- [x] 13. Final checkpoint — Integración completa y todos los tests
  - Ejecutar el suite completo de tests: PBT de Edge Function, tests de Vitest del Widget, tests pgTAP de SQL
  - Verificar que las 13 Properties pasan con `numRuns: 100` en fast-check
  - Verificar cobertura: Edge Function ≥ 80%, Chat Widget ≥ 75%, 100% de políticas RLS verificadas
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Las sub-tareas marcadas con `*` son opcionales y pueden omitirse para una implementación MVP más rápida
- Cada tarea referencia requisitos específicos para trazabilidad
- El lenguaje de implementación es **Deno/TypeScript** para la Edge Function y el script de ingesta; **vanilla JS** para el Chat Widget; **Vitest** para los tests del Widget
- Los tests PBT usan `fast-check` importado vía `esm.sh` en el entorno Deno, y vía `npm` en el entorno Vitest
- La Edge Function se testea unitariamente exportando la función `handleChat` que acepta el request y un contexto de mocks; esto permite tests sin desplegar en Supabase
- El script de ingesta se ejecuta manualmente (`deno run --allow-read --allow-net --allow-env scripts/ingest.ts`); no hay tarea de CI para ingesta automática en este plan
- Los checkpoints garantizan validación incremental: base de datos → ingesta → backend → frontend → integración

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "4.2", "4.3"] },
    { "id": 3, "tasks": ["2.4", "4.4", "4.5"] },
    { "id": 4, "tasks": ["2.5", "4.6", "4.7"] },
    { "id": 5, "tasks": ["4.8", "6.1"] },
    { "id": 6, "tasks": ["6.2"] },
    { "id": 7, "tasks": ["6.3", "6.4"] },
    { "id": 8, "tasks": ["6.5", "6.6", "6.7"] },
    { "id": 9, "tasks": ["6.8", "6.9", "8.1"] },
    { "id": 10, "tasks": ["8.2", "8.3"] },
    { "id": 11, "tasks": ["8.4", "8.5"] },
    { "id": 12, "tasks": ["8.6"] },
    { "id": 13, "tasks": ["8.7", "10.1"] },
    { "id": 14, "tasks": ["10.2", "10.3", "10.4", "11.1"] },
    { "id": 15, "tasks": ["12"] }
  ]
}
```
