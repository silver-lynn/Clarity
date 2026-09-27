@echo off
cd /d "%~dp0"
powershell -NoProfile -WindowStyle Hidden -Command "try { Invoke-RestMethod 'http://127.0.0.1:8002/health' -TimeoutSec 2 | Out-Null } catch { Start-Process -WindowStyle Hidden -FilePath '..\..\work\whisperlivekit-venv\Scripts\python.exe' -ArgumentList 'studio\cloud-asr-server.py' }"
