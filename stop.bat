@echo off
echo 正在停止 ChipMate 服务...
taskkill /FI "WINDOWTITLE eq ChipMate-Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq ChipMate-Frontend*" /T /F >nul 2>&1
echo.
echo 已停止。再见！
timeout /t 2 /nobreak >nul
