@echo off
title Parametric 3D Interior VR Launcher
echo ========================================================
echo   Starting Parametric 3D Interior Project
echo ========================================================
echo.

REM 1. Start Backend API on port 8000 in a new window
echo [1/2] Starting Backend API (Port 8000)...
start "Backend API (Port 8000)" cmd /k "cd /d %~dp0 && python backend\main.py"

REM 2. Start Frontend Web Server on port 8080 in a new window
echo [2/2] Starting Frontend Web Server (Port 8080)...
start "Frontend Web Server (Port 8080)" cmd /k "cd /d %~dp0 && python -m http.server 8080 -d frontend"

echo.
echo ========================================================
echo   Servers are running!
echo   - 3D App:     http://localhost:8080
echo   - AI Backend: http://localhost:8000
echo ========================================================
echo.
timeout /t 2 >nul
start http://localhost:8080
