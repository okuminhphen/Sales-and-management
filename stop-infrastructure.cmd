@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-dev\stop-infrastructure.ps1"
set "HAPPYSHOP_EXIT_CODE=%ERRORLEVEL%"
echo.
pause
exit /b %HAPPYSHOP_EXIT_CODE%
