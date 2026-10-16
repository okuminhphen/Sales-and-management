@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-dev\start-local.ps1"
set "HAPPYSHOP_EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%HAPPYSHOP_EXIT_CODE%"=="0" echo Khoi dong khong hoan tat. Hay doc thong bao loi o tren.
pause
exit /b %HAPPYSHOP_EXIT_CODE%
