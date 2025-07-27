@echo off

echo Starting Python backend (main.py)...
start cmd /k "python main.py"

:: Wait 4 seconds to let backend fully initialize
timeout /t 4 >nul

:: Open backend in browser
start http://localhost:8000

echo Starting frontend HTTP server (http://localhost:3000)...
start cmd /k "python -m http.server 3000"

:: Wait 1 second before opening frontend
timeout /t 1 >nul
start http://localhost:3000

echo All systems are running!
