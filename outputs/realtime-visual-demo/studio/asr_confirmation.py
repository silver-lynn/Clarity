"""Sentence-level acoustic confirmation. No LLM rewriting or persisted audio."""
from pathlib import Path
import re
import numpy as np
import sherpa_onnx

ROOT=Path(__file__).resolve().parents[3]
MODEL=ROOT/'work/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'

def make_confirmation():
    return sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=str(MODEL/'model.int8.onnx'),tokens=str(MODEL/'tokens.txt'),
        num_threads=2,provider='cpu',language='auto',use_itn=True)

def make_vad():
    config=sherpa_onnx.VadModelConfig()
    config.silero_vad.model=str(ROOT/'work/whisperlivekit-venv/Lib/site-packages/whisperlivekit/silero_vad_models/silero_vad.onnx')
    config.silero_vad.min_silence_duration=0.65
    config.silero_vad.min_speech_duration=0.25
    config.silero_vad.max_speech_duration=15
    config.sample_rate=16000;config.num_threads=1
    return sherpa_onnx.VoiceActivityDetector(config,buffer_size_in_seconds=30)

def confirm(recognizer,audio,fallback):
    if recognizer is None or len(audio)<1600:return fallback
    # Do not fabricate text for an effectively silent segment.
    if np.max(np.abs(audio),initial=0)<0.001:return fallback
    stream=recognizer.create_stream();stream.accept_waveform(16000,audio)
    recognizer.decode_stream(stream)
    text=re.sub(r'<\|[^>]+\|>','',stream.result.text).strip()
    return text or fallback
