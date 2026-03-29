@echo off
echo ◆ Softcurse H.E.X. — Setup
echo ────────────────────────────

node --version >nul 2>&1 || (echo ✗ Node.js not found. Install from https://nodejs.org && exit /b 1)
echo ✓ Node.js found

echo → Installing npm packages...
npm install
if %errorlevel% neq 0 exit /b %errorlevel%

echo → Rebuilding native modules for Electron...
npm run rebuild
if %errorlevel% neq 0 (
  echo ⚠ Rebuild failed. Try: npm install --global windows-build-tools
  echo   Then run this script again.
  exit /b 1
)

echo.
echo ◆ Setup complete! Run: npm start
echo.
echo Voice models: open Settings → Voice tab → Download Selected
echo.
