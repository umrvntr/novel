@echo off
echo ===================================================
echo   LAYER 5 DEFENSE: LOCAL SAFETY NET
echo ===================================================
echo.

echo [1/4] Checking Backend...
cd backend
call npm run build
if %errorlevel% neq 0 (
    echo [FAIL] Backend build/typecheck failed!
    exit /b 1
)
call npx vitest run
if %errorlevel% neq 0 (
    echo [FAIL] Backend tests failed!
    exit /b 1
)

echo.
echo [2/4] Checking Frontend...
cd ..\frontend
call npm run build
if %errorlevel% neq 0 (
    echo [FAIL] Frontend build/typecheck failed!
    exit /b 1
)
call npx vitest run
if %errorlevel% neq 0 (
    echo [FAIL] Frontend tests failed!
    exit /b 1
)

echo.
echo ===================================================
echo   [SUCCESS] SYSTEM IS STABLE. READY TO SHIP.
echo ===================================================
cd ..
exit /b 0
