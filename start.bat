@echo off
echo Starting AI Interview Agent...
echo.

:: Start backend
echo [1/2] Starting FastAPI backend on http://localhost:8000
start "Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --reload --port 8000"

:: Wait a moment then start frontend
timeout /t 2 /nobreak > nul

:: Start frontend
echo [2/2] Starting React frontend on http://localhost:5173
start "Frontend" cmd /k "cd /d %~dp0frontend && set PATH=C:\Program Files\nodejs;%PATH% && npm run dev"

echo.
echo Both servers starting. Open http://localhost:5173 in your browser.
