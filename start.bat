@echo off
chcp 65001 >nul
title ChipMate Launcher
cd /d %~dp0

echo ==========================================
echo   ChipMate - AI Embedded Debug Assistant
echo ==========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install it first:
    echo         https://www.python.org/downloads/
    echo         Remember to check "Add Python to PATH"
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install it first:
    echo         https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] Checking backend dependencies...
cd backend
pip install -r requirements.txt -q 2>nul
pip install stcgal -q 2>nul
cd ..

echo [2/3] Checking frontend dependencies...
if not exist frontend\node_modules (
    cd frontend
    call npm install
    cd ..
)

echo [3/3] Starting ChipMate...
start "ChipMate Backend" cmd /c "cd /d %~dp0backend && python main.py"
timeout /t 2 /nobreak >nul
start "ChipMate Frontend" cmd /c "cd /d %~dp0frontend && npm run dev"

echo.
echo Backend:  http://127.0.0.1:8720
echo Frontend: http://127.0.0.1:5174
echo Browser will open automatically...
timeout /t 4 /nobreak >nul
start http://127.0.0.1:5174
echo.
echo Done! Close this window, ChipMate keeps running.
pause
