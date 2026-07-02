@echo off
echo Starting NexChat local server...
echo.
echo Open http://localhost:8080 in your browser
echo Press Ctrl+C to stop the server
echo.
python -m http.server 8080 2>nul
if %errorlevel% neq 0 (
  echo Python not found, trying python3...
  python3 -m http.server 8080 2>nul
  if %errorlevel% neq 0 (
    echo.
    echo Could not start server. Please install Python from https://python.org
    pause
  )
)
