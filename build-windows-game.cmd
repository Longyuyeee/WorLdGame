@echo off
setlocal
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron runtime is missing. Run npm ci, then:
  echo npm run install:electron-runtime --workspace @world-studio/windows-shell-conformance
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" "tools\windows-package-ui\main.mjs"
