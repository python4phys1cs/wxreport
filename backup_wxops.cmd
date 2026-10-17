@echo off
setlocal enabledelayedexpansion

:: ============================================================================
:: WXOps 15-Day Persistent Observation Archive Backup Script
::
:: Usage:
::   backup_wxops.cmd <BASE_URL>
::
:: Example:
::   backup_wxops.cmd https://your-wxops.vercel.app
:: ============================================================================

set "BASE_URL=%~1"
if "%BASE_URL%"=="" (
    set /p "BASE_URL=Enter WXOps Base URL (e.g. https://your-wxops.vercel.app): "
)

:: Trim trailing slashes
if "%BASE_URL:~-1%"=="/" set "BASE_URL=%BASE_URL:~0,-1%"

if "%BASE_URL%"=="" (
    echo [ERROR] No WXOps Base URL provided. Aborting backup.
    exit /b 1
)

:: Verify curl is available in Windows
where curl >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 'curl' was not found on this system.
    echo Windows 10/11 includes curl by default. Please ensure curl is in your PATH.
    exit /b 1
)

:: Create local backups directory if it does not exist
if not exist "backups" mkdir "backups"

:: Generate timestamp in format YYYYMMDD_HHMMSS
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set "DT=%%I"
if not "%DT%"=="" (
    set "TIMESTAMP=%DT:~0,8%_%DT:~8,6%"
) else (
    for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss" 2^>nul`) do set "TIMESTAMP=%%I"
)
if "%TIMESTAMP%"=="" (
    set "TIMESTAMP=%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
    set "TIMESTAMP=!TIMESTAMP: =0!"
)

set "OUTPUT_FILE=backups\wxops_archive_%TIMESTAMP%.json"
set "ENDPOINT=%BASE_URL%/api/observations/archive"

echo [WXOps] Requesting 15-day observation archive from: %ENDPOINT%
curl -fsSL "%ENDPOINT%" -o "%OUTPUT_FILE%"

if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] 15-day observation archive backed up successfully.
    echo [SAVED] %OUTPUT_FILE%
    exit /b 0
) else (
    echo [ERROR] Failed to download archive from %ENDPOINT% (Exit code: %ERRORLEVEL%).
    if exist "%OUTPUT_FILE%" del "%OUTPUT_FILE%" >nul 2>&1
    exit /b 1
)
