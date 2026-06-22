@echo off
echo ========================================
echo   Configuracion completa del Agente Conversacional
echo ========================================
echo.

REM Verificar si hay un argumento (PAT)
if "%1"=="" (
    echo ERROR: Se requiere la Personal Access Token (PAT)
    echo.
    echo Uso: setup.bat TU_PAT_AQUI
    echo.
    echo Para generar una PAT:
    echo 1. Ve a: https://supabase.com/dashboard/account/tokens
    echo 2. Selecciona tu proyecto: dsrxcqjivhvhvpqumcvb
    echo 3. Selecciona el rol: service_role
    echo 4. Copia la clave y ejecuta: setup.bat TU_PAT_AQUI
    pause
    exit /b 1
)

set PAT=%1

echo [1/5] Verificando autenticacion con Supabase...
call supabase login --token %PAT%
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Fallo al autenticar con Supabase. Verifica tu PAT.
    pause
    exit /b 1
)

echo.
echo [2/5] Vinculando al proyecto...
call supabase link --project-ref dsrxcqjivhvhvpqumcvb
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Fallo al vincular al proyecto.
    pause
    exit /b 1
)

echo.
echo [3/5] Configurando secrets (GROQ_API_KEY, etc.)...
call supabase secrets set GROQ_API_KEY=***REDACTED***|x
if %ERRORLEVEL% NEQ 0 (
    echo ADVERTENCIA: Fallo al configurar GROQ_API_KEY
)

call supabase secrets set SUPABASE_URL=https://dsrxcqjivhvhvpqumcvb.supabase.co
if %ERRORLEVEL% NEQ 0 (
    echo ADVERTENCIA: Fallo al configurar SUPABASE_URL
)

call supabase secrets set SUPABASE_ANON_KEY=sb_publishable_2RJU6BMuljCO8fNHtQcQzw_yFEzXG7E
if %ERRORLEVEL% NEQ 0 (
    echo ADVERTENCIA: Fallo al configurar SUPABASE_ANON_KEY
)

call supabase secrets set SUPABASE_SERVICE_ROLE_KEY=***REDACTED***
if %ERRORLEVEL% NEQ 0 (
    echo ADVERTENCIA: Fallo al configurar SUPABASE_SERVICE_ROLE_KEY
)

call supabase secrets set ALLOWED_ORIGINS=https://portafolio-luis-romero.vercel.app
if %ERRORLEVEL% NEQ 0 (
    echo ADVERTENCIA: Fallo al configurar ALLOWED_ORIGINS
)

echo.
echo [4/5] Desplegando Edge Function...
call supabase functions deploy chat --project-ref dsrxcqjivhvhvpqumcvb
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
