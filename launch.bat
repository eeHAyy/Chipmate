@echo off
cd /d D:\chipmate--codex\frontend
start "ChipMate Vite" cmd /c "npm run dev"
echo Waiting for Vite...
:wait
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:5174 >nul 2>&1
if errorlevel 1 goto wait
echo Starting ChipMate...
npx electron .
