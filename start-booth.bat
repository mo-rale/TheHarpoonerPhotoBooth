@echo off
REM Starts the local server and opens Chrome in kiosk mode.
REM --kiosk-printing sends prints straight to the default printer with no dialog.
cd /d "%~dp0"
start "Photobooth server" /min cmd /c "node server.js"
timeout /t 2 /nobreak >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --use-fake-ui-for-media-stream http://localhost:3000
