@echo off
setlocal
cd /d "%~dp0"

set DIST_DIR=%CD%\dist
set EXT_DIR=%DIST_DIR%\extension
set ZIP_FILE=%DIST_DIR%\zhuyin-phonetic-corrector.zip

echo [1/6] Installing dependencies...
call npm install
if errorlevel 1 goto :error

echo [2/6] Building React panel...
call npm run build:panel
if errorlevel 1 goto :error

echo [3/6] Running unit tests...
call npm test
if errorlevel 1 goto :error

echo [4/6] Preparing package directory...
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%"
mkdir "%EXT_DIR%"
mkdir "%EXT_DIR%\src"
mkdir "%EXT_DIR%\panel"

copy /y "manifest.json" "%EXT_DIR%\manifest.json" >nul
xcopy /e /i /y "src\*" "%EXT_DIR%\src\" >nul
xcopy /e /i /y "panel\*" "%EXT_DIR%\panel\" >nul

echo [5/6] Creating zip file...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%EXT_DIR%\*' -DestinationPath '%ZIP_FILE%' -Force"
if errorlevel 1 goto :error
echo Package created: %ZIP_FILE%

echo [6/6] Optional upload...
if /i "%CWS_UPLOAD%"=="1" (
  set PUBLISH_FLAG=
  if /i "%CWS_PUBLISH%"=="1" set PUBLISH_FLAG=--publish
  node "scripts\upload-webstore.mjs" "%ZIP_FILE%" %PUBLISH_FLAG%
  if errorlevel 1 goto :error
  echo Upload completed
) else (
  echo Upload skipped (set CWS_UPLOAD=1 to enable)
)

echo Done
exit /b 0

:error
echo Failed Please check the logs above
exit /b 1
