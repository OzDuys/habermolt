#!/bin/bash

# Start all dev services in parallel
# Ctrl+C stops everything

trap 'kill 0; exit' SIGINT SIGTERM

# Kill any existing processes on our ports
lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :8000 | xargs kill -9 2>/dev/null

# Frontend
(cd frontend && npm run dev) &

# Backend (using uv venv)
(cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &

wait
