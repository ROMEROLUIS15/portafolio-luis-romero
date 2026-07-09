@echo off
echo ========================================
echo   Configuracion completa del Agente Conversacional
echo ========================================
echo.

REM Verificar si hay un argumento (PAT)
if "%1"=="" (
    echo ERROR: Se requiere la Personal Access Token ^(PAT^)
    echo.
    echo Uso: setup.bat TU_PAT_AQUI
    echo.
    echo Para generar una PAT:
    echo 1. Ve a: https://supabase.com/dashboard/account/tokens
    echo 2. Generala y ejecuta: setup.bat TU_PAT_AQUI
    pause
    exit /b 1
)

set PAT=%1

REM ─── Cargar secretos desde .env (nunca incrustarlos en este archivo) ─────────
if not exist ".env" (
    echo ERROR: No se encontro .env
    echo Copia .env.example a .env y rellena tus claves.
    pause
    exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"

for %%V in (SUPABASE_PROJECT_REF SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY GROQ_API_KEY ALLOWED_ORIGINS) do (
    if not defined %%V (
        echo ERROR: Falta %%V en .env
        pause
        exit /b 1
    )
)

echo [1/5] Verificando autenticacion con Supabase...
call supabase login --token %PAT%
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Fallo al autenticar con Supabase. Verifica tu PAT.
    pause
    exit /b 1
)

echo.
echo [2/5] Vinculando al proyecto...
call supabase link --project-ref %SUPABASE_PROJECT_REF%
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Fallo al vincular al proyecto.
    pause
    exit /b 1
)

echo.
echo [3/5] Configurando secrets (GROQ_API_KEY, etc.)...
call supabase secrets set GROQ_API_KEY=%GROQ_API_KEY%
if %ERRORLEVEL% NEQ 0 (
    echo ADVERTENCIA: Fallo al configurar GROQ_API_KEY
)

call supabase secrets set SUPABASE_URL=%SUPABASE_URL%
if %ERRORLEVEL% NEQ 0 (
    echo ADVERTENCIA: Fallo al configurar SUPABASE_URL
)

call supabase secrets set SUPABASE_ANON_KEY=%SUPABASE_ANON_KEY%
if %ERRORLEVEL% NEQ 0 (
    echo ADVERTENCIA: Fallo al configurar SUPABASE_ANON_KEY
)

call supabase secrets set SUPABASE_SERVICE_ROLE_KEY=%SUPABASE_SERVICE_ROLE_KEY%
if %ERRORLEVEL% NEQ 0 (
    echo ADVERTENCIA: Fallo al configurar SUPABASE_SERVICE_ROLE_KEY
)

call supabase secrets set ALLOWED_ORIGINS=%ALLOWED_ORIGINS%
if %ERRORLEVEL% NEQ 0 (
    echo ADVERTENCIA: Fallo al configurar ALLOWED_ORIGINS
)

echo.
echo [4/5] Desplegando Edge Function...
call supabase functions deploy chat --project-ref %SUPABASE_PROJECT_REF%
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Fallo al desplegar la Edge Function.
    pause
    exit /b 1
)

echo.
echo [5/5] Ejecutando ingesta de datos...
call run_ingest.bat

echo.
echo ========================================
echo   Configuracion COMPLETADA
echo ========================================
echo.
echo Tu portafolio con agente conversacional RAG ya esta listo!
echo Visita: https://portafolio-luis-romero.vercel.app
echo.
pause
