#!/bin/bash

# Start all dev services in parallel
# Ctrl+C stops everything

trap 'kill 0; exit' SIGINT SIGTERM

# Frontend
(cd frontend && npm run dev) &

# Backend
(cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &

# ngrok tunnel
ngrok http 3000 --url=legal-gecko-locally.ngrok-free.app &

wait
