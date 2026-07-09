@echo off
echo ========================================
echo   Ingesta de datos para Agente Conversacional
echo ========================================
echo.
echo Cargando variables de entorno desde .env...
if not exist ".env" (
    echo ERROR: No se encontro .env
    echo Copia .env.example a .env y rellena tus claves.
    pause
    exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"

for %%V in (SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY) do (
    if not defined %%V (
        echo ERROR: Falta %%V en .env
        pause
        exit /b 1
    )
)

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
