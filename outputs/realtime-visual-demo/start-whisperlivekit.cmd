@echo off
setlocal
set "ROOT=%~dp0..\.."
set "WLK=%ROOT%\work\whisperlivekit-venv\Scripts\python.exe"
set "MODEL=%ROOT%\work\models\faster-whisper-small"

if not exist "%WLK%" (
  echo WhisperLiveKit is not installed in this project.
  echo Expected: %WLK%
  pause
  exit /b 1
)

if not exist "%MODEL%\model.bin" (
  echo The local Whisper small model is missing.
  echo Expected: %MODEL%\model.bin
  pause
  exit /b 1
)

echo Starting WhisperLiveKit at ws://127.0.0.1:8000/asr
echo Model: faster-whisper-small, CPU int8, multilingual auto detection
echo Keep this window open while using LiveCanvas. Press Ctrl+C to stop.
echo.
"%WLK%" "%~dp0studio\local-asr-server.py" serve --host 127.0.0.1 --port 8000 --model small --model_dir "%MODEL%" --backend faster-whisper --backend-policy localagreement --language auto --pcm-input --min-chunk-size 1 --buffer_trimming_sec 8 --warmup-file ""

if errorlevel 1 (
  echo.
  echo WhisperLiveKit stopped with an error.
  pause
)
