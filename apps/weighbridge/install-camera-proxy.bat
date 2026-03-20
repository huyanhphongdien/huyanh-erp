@echo off
echo ============================================
echo   Cai dat Camera Proxy - Tram Can Huy Anh
echo ============================================
echo.

:: Copy exe to Program Files
set INSTALL_DIR=%ProgramFiles%\HuyAnhCameraProxy
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
copy /Y "%~dp0camera-proxy.exe" "%INSTALL_DIR%\camera-proxy.exe"
echo [OK] Da copy camera-proxy.exe vao %INSTALL_DIR%

:: Create startup shortcut (run hidden via vbs)
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set VBS_FILE=%INSTALL_DIR%\start-hidden.vbs

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_FILE%"
echo WshShell.Run """%INSTALL_DIR%\camera-proxy.exe""", 0, False >> "%VBS_FILE%"

:: Create shortcut to vbs in Startup
copy /Y "%VBS_FILE%" "%STARTUP%\CameraProxy.vbs"
echo [OK] Da them vao khoi dong cung Windows

:: Start now
start "" "%VBS_FILE%"
echo [OK] Camera Proxy dang chay tai http://localhost:3456

echo.
echo ============================================
echo   Cai dat hoan tat!
echo   Camera Proxy se tu dong chay khi bat may.
echo   Test: http://localhost:3456/health
echo ============================================
pause
