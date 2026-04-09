#!/bin/bash

# Start backend + frontend only (no ngrok)
# Ctrl+C stops everything
#
# Usage: ./dev_local.sh [persona]
#   persona: haberagent (default) | openclaw | none | logged-out
#   Example: ./dev_local.sh logged-out

trap 'kill 0; exit' SIGINT SIGTERM

export NEXT_PUBLIC_DEV_PERSONA="${1:-haberagent}"
echo "Dev persona: $NEXT_PUBLIC_DEV_PERSONA"

# Kill any existing processes on our ports
lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :8000 | xargs kill -9 2>/dev/null

# Frontend
(cd frontend && npm run dev) 2>&1 | sed 's/^/[frontend] /' &

# Backend
(cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) 2>&1 | sed 's/^/[backend]  /' &

wait
