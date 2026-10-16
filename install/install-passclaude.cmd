@echo off
rem One-click installer for passClaude: double-click it. It adds passClaude to Claude Code for your Windows user.
rem All it runs is: claude mcp add --scope user passclaude -- npx -y passclaude
setlocal
title Install passClaude
echo.
echo   passClaude installer
echo   --------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. passClaude needs Node.js 20 or newer.
  echo   Opening https://nodejs.org - install the LTS version, then double-click this file again.
  start "" "https://nodejs.org"
  goto end
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 20 ? 1 : 0)"
if errorlevel 1 (
  echo   Your Node.js is too old. passClaude needs Node.js 20 or newer.
  echo   Opening https://nodejs.org - install the LTS version, then double-click this file again.
  start "" "https://nodejs.org"
  goto end
)

where claude >nul 2>nul
if errorlevel 1 (
  echo   Claude Code was not found. Install it first:
  echo   https://docs.claude.com/en/docs/claude-code/setup
  echo   Then double-click this file again.
  goto end
)

call claude mcp get passclaude >nul 2>nul
if not errorlevel 1 (
  echo   passClaude is already installed.
  echo   If Claude Code does not show it, restart Claude Code.
  goto end
)

call claude mcp add --scope user passclaude -- npx -y passclaude
if errorlevel 1 (
  echo.
  echo   Something went wrong. Nothing was changed.
  echo   You can also open Claude Code and say:
  echo   "Run: claude mcp add --scope user passclaude -- npx -y passclaude"
  goto end
)

echo.
echo   Done! passClaude is installed.
echo   Restart Claude Code, then try saying: "Save my Netflix password"

:end
echo.
echo   Press any key to close this window.
pause >nul
