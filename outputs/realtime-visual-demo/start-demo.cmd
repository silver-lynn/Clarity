@echo off
setlocal
cd /d "%~dp0"
set "NODE=C:\Users\15950\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

start "LiveCanvas Server" /min "%NODE%" "server.js"
powershell -NoProfile -WindowStyle Hidden -Command "try { Invoke-RestMethod 'http://127.0.0.1:8001/health' -TimeoutSec 2 | Out-Null } catch { if(Test-Path '..\..\work\whisperlivekit-venv\Scripts\python.exe'){ Start-Process -WindowStyle Hidden -FilePath '..\..\work\whisperlivekit-venv\Scripts\python.exe' -ArgumentList 'studio\streaming-asr-server.py' } }"
powershell -NoProfile -WindowStyle Hidden -Command "try { Invoke-RestMethod 'http://127.0.0.1:8002/health' -TimeoutSec 2 | Out-Null } catch { Start-Process -WindowStyle Hidden -FilePath '..\..\work\whisperlivekit-venv\Scripts\python.exe' -ArgumentList 'studio\cloud-asr-server.py' }"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4175/studio/index.html"

echo LiveCanvas is running at http://127.0.0.1:4175
echo Close the minimized server window to stop it.
timeout /t 4 /nobreak >nul
