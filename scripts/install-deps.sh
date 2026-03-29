#!/usr/bin/env bash
# Softcurse H.E.X. — Dependency Installer
set -e

echo "◆ Softcurse H.E.X. — Setup"
echo "────────────────────────────"

if ! command -v node &> /dev/null; then
  echo "✗ Node.js not found. Please install from https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "✗ Node.js v18+ required. Current: $(node -v)"
  exit 1
fi
echo "✓ Node.js $(node -v)"

echo "→ Installing npm packages..."
npm install

echo ""
echo "→ Rebuilding native modules for Electron..."
npm run rebuild

echo ""
echo "◆ Setup complete!"
echo ""
echo "  Start: npm start"
echo ""
echo "  Voice models (download inside app):"
echo "    Settings → Voice tab → ⬇ DOWNLOAD SELECTED"
echo "    Whisper STT ~40MB + Piper TTS per language ~65MB"
echo ""
echo "──────────────────────────────────────"
echo "  System online. HEX ready."
echo "──────────────────────────────────────"
