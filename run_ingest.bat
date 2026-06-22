@echo off
echo ========================================
echo   Ingesta de datos para Agente Conversacional
echo ========================================
echo.
echo Configurando variables de entorno...
set SUPABASE_URL=https://dsrxcqjivhvhvpqumcvb.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=***REDACTED***
set SUPABASE_ANON_KEY=sb_publishable_2RJU6BMuljCO8fNHtQcQzw_yFEzXG7E

echo.
echo Verificando archivos fuente...
if not exist "assets\images\LuisRomero_AIEngineer-Backend_2026_EN.pdf" (
    echo ERROR: No se encontro LuisRomero_AIEngineer-Backend_2026_EN.pdf
    pause
    exit /b 1
)
if not exist "assets\images\LuisRomero_AIEngineer-Backend_2026_ES.pdf" (
    echo ERROR: No se encontro LuisRomero_AIEngineer-Backend_2026_ES.pdf
    pause
    exit /b 1
)
if not exist "cronix-stats.json" (
    echo ERROR: No se encontro cronix-stats.json
    pause
    exit /b 1
)

echo.
echo Iniciando ingesta de datos...
echo.

deno run --allow-read --allow-net --allow-env scripts/ingest.ts

echo.
echo ========================================
echo   Proceso completado
echo ========================================
pause
