@echo off
setlocal
cd /d %~dp0

echo ============================================
echo   ChipMate 一键启动器
echo ============================================
echo.

REM ---------- 检查 Python ----------
set PY=python
where python >nul 2>&1
if errorlevel 1 (
    where py >nul 2>&1
    if errorlevel 1 (
        echo [错误] 未检测到 Python！
        echo.
        echo 请先安装 Python 3.10+：
        echo   1. 打开 https://www.python.org/downloads/
        echo   2. 下载安装包，安装时【必须勾选】"Add Python to PATH"
        echo   3. 装完重新双击本脚本
        echo.
        pause
        exit /b 1
    ) else (
        set PY=py
    )
)

where pip >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 pip，请重新安装 Python 并勾选 "Add Python to PATH"
    pause
    exit /b 1
)

REM ---------- 检查 Node.js ----------
where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js！
    echo.
    echo 请先安装 Node.js 18+：
    echo   1. 打开 https://nodejs.org/
    echo   2. 下载 LTS 版本安装包，一路下一步
    echo   3. 装完重新双击本脚本
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 npm，请重新安装 Node.js
    pause
    exit /b 1
)

echo [1/4] 安装后端依赖（首次约 1-3 分钟）...
cd backend
%PY% -m pip install -r requirements.txt
if errorlevel 1 (
    echo 后端依赖安装失败，重试一次...
    %PY% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [错误] 后端依赖安装失败，请检查网络后重试
        pause
        exit /b 1
    )
)
%PY% -m pip install stcgal
cd ..

echo [2/4] 安装前端依赖（首次约 5-15 分钟）...
if not exist frontend\node_modules (
    cd frontend
    call npm install
    if errorlevel 1 (
        echo 前端依赖安装失败，重试一次...
        call npm install
        if errorlevel 1 (
            echo [错误] 前端依赖安装失败，请检查网络后重试
            pause
            exit /b 1
        )
    )
    cd ..
)

echo [3/4] 启动后端服务...
start "ChipMate-Backend" cmd /c "cd /d %~dp0backend && %PY% main.py"
echo 等待后端就绪...

REM ---------- 健康检查（最多等 30 秒）----------
set HEALTH_OK=0
for /l %%i in (1,1,30) do (
    >nul 2>&1 curl -s http://127.0.0.1:8720/health
    if not errorlevel 1 (
        set HEALTH_OK=1
        goto healthy
    )
    timeout /t 1 /nobreak >nul
)
:healthy
if "%HEALTH_OK%"=="0" (
    echo.
    echo [警告] 后端 30 秒内未就绪，可能端口 8720 被占用
    echo        请检查是否有其他程序占用，或关闭后重试
)

echo [4/4] 启动前端...
start "ChipMate-Frontend" cmd /c "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================
echo   ChipMate 启动完成！
echo.
echo   访问地址:  http://127.0.0.1:5174
echo   后端地址:  http://127.0.0.1:8720
echo.
echo   关闭方法:  双击 stop.bat 停止全部服务
echo ============================================
timeout /t 3 /nobreak >nul
start http://127.0.0.1:5174
pause
