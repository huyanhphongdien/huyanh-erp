@echo off
echo Go cai dat Camera Proxy...

:: Kill process
taskkill /F /IM camera-proxy.exe 2>nul

:: Remove startup
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CameraProxy.vbs" 2>nul

:: Remove install dir
rmdir /S /Q "%ProgramFiles%\HuyAnhCameraProxy" 2>nul

echo [OK] Da go cai dat Camera Proxy.
pause
