#!/usr/bin/env bash
# Keep Next.js dev server alive — auto-restarts on crash
cd "$(dirname "$0")"
trap '' SIGTTIN SIGTTOU
while true; do
  echo "[watchdog] Starting next dev..."
  npx next dev 2>&1
  echo "[watchdog] Exited. Restarting in 2s..."
  sleep 2
done
