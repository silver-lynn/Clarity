@echo off
setlocal
set "ROOT=%~dp0..\.."
set "PYTHON=%ROOT%\work\whisperlivekit-venv\Scripts\python.exe"
echo LiveCanvas Chinese streaming captions - localhost:8001
echo Keep this window open during the lecture.
"%PYTHON%" "%~dp0studio\streaming-asr-server.py"
if errorlevel 1 pause
