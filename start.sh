#!/usr/bin/env bash
# Serves the Frontend over http://localhost:8000 (embed providers block file:// pages)
cd "$(dirname "$0")/Frontend" || exit 1
echo "Open http://localhost:8000 in your browser (Ctrl+C to stop)"
python3 -m http.server 8000
