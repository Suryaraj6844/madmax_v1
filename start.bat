@echo off
cd /d "%~dp0Frontend"
echo Open http://localhost:8000 in your browser
python -m http.server 8000
