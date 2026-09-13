@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-release.ps1"
if errorlevel 1 (
  echo.
  echo Release failed.
  pause
  exit /b 1
)
endlocal
