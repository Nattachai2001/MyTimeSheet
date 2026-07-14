@echo off
setlocal

set "DEBUG_PORT=9222"
set "DEBUG_PROFILE=%~dp0..\auth\chrome-debug-profile"

set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%CHROME_EXE%" (
  echo Opening Chrome with remote debugging on port %DEBUG_PORT%...
  echo Profile: %DEBUG_PROFILE%
  start "" "%CHROME_EXE%" --remote-debugging-port=%DEBUG_PORT% --user-data-dir="%DEBUG_PROFILE%"
  exit /b 0
)

set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_EXE%" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE_EXE%" (
  echo Chrome not found. Opening Microsoft Edge with remote debugging on port %DEBUG_PORT%...
  echo Profile: %DEBUG_PROFILE%
  start "" "%EDGE_EXE%" --remote-debugging-port=%DEBUG_PORT% --user-data-dir="%DEBUG_PROFILE%"
  exit /b 0
)

echo Could not find Chrome or Edge.
exit /b 1
