@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 or newer is required to run the WorLd Studio acceptance editor.
  pause
  exit /b 1
)

node.exe -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)"
if errorlevel 1 (
  echo Node.js 22.12 or newer is required to run the WorLd Studio acceptance editor.
  pause
  exit /b 1
)

if not exist "node_modules\vite\package.json" (
  echo Installing locked workspace dependencies...
  call npm.cmd ci
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

call npm.cmd run acceptance:n23 -- %*
exit /b %errorlevel%
