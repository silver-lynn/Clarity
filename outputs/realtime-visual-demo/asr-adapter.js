export const ASR_PROVIDERS = {
  browser: "browser-web-speech",
  whisperLiveKit: "whisper-livekit",
};

export const DEFAULT_WHISPER_LIVEKIT_ENDPOINT = "ws://127.0.0.1:8000/asr";

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function browserGlobals() {
  return typeof window !== "undefined" ? window : {};
}

function mediaGlobals() {
  const root = browserGlobals();
  return { root, navigator: typeof navigator !== "undefined" ? navigator : root.navigator };
}

function elapsedSince(startedAt) {
  return startedAt === null ? 0 : Math.max(0, Math.round(now() - startedAt));
}

export function chooseAlternative(result) {
  const alternatives = Array.from(result || []).map((alternative, index) => ({
    text: String(alternative?.transcript || "").trim(),
    confidence: Number.isFinite(alternative?.confidence) ? alternative.confidence : null,
    index,
  })).filter((alternative) => alternative.text);
  if (!alternatives.length) return null;
  return alternatives.reduce((best, candidate) => {
    if (candidate.confidence === null) return best;
    if (best.confidence === null || candidate.confidence > best.confidence) return candidate;
    return best;
  }, alternatives[0]);
}

export function normalizeAsrProvider(provider) {
  if (provider === ASR_PROVIDERS.whisperLiveKit || provider === "whisper" || provider === "wlk") return ASR_PROVIDERS.whisperLiveKit;
  return ASR_PROVIDERS.browser;
}

export function asrProviderLabel(provider) {
  return normalizeAsrProvider(provider) === ASR_PROVIDERS.whisperLiveKit ? "WhisperLiveKit" : "浏览器基线";
}

export function normalizeWlkLanguage(language) {
  const value = String(language || "").toLowerCase();
  if (value.startsWith("en")) return "en";
  if (value.startsWith("zh") || value.includes("cn") || value.includes("hans")) return "zh";
  return "auto";
}

export function normalizeBrowserSpeechLanguage(language) {
  return normalizeWlkLanguage(language) === "en" ? "en-US" : "zh-CN";
}

export function buildWhisperLiveKitUrl(endpoint = DEFAULT_WHISPER_LIVEKIT_ENDPOINT, language = "auto") {
  const raw = String(endpoint || DEFAULT_WHISPER_LIVEKIT_ENDPOINT).trim() || DEFAULT_WHISPER_LIVEKIT_ENDPOINT;
  let url;
  try {
    url = new URL(raw, typeof location !== "undefined" ? location.href : "http://127.0.0.1/");
  } catch {
    return raw;
  }
  const normalizedLanguage = normalizeWlkLanguage(language);
  if (normalizedLanguage !== "auto" && !url.searchParams.has("language")) url.searchParams.set("language", normalizedLanguage);
  return url.toString();
}

export function parseWhisperLiveKitMessage(payload) {
  const message = typeof payload === "string" ? safeJson(payload) : payload;
  if (!message || typeof message !== "object") return { finalLines: [], partialText: "", config: null, raw: message };

  const config = message.config || (message.type === "config" ? message : null);
  const finalLines = normalizeLines(message.lines || message.segments || message.final || message.finals);
  const partialText = cleanTranscript(
    message.buffer_transcription
    || message.bufferTranscription
    || message.partial
    || message.partial_text
    || (message.type === "partial" ? message.text : "")
  );
  const directFinal = message.type === "final" || message.is_final || message.isFinal ? cleanTranscript(message.text || message.transcript || message.transcription) : "";
  if (directFinal) finalLines.push({ text: directFinal, key: `direct:${directFinal}` });

  return { finalLines, partialText, config, raw: message };
}

export class BrowserSpeechAdapter extends EventTarget {
  constructor({ language = "zh-CN" } = {}) {
    super();
    this.language = normalizeBrowserSpeechLanguage(language);
    this.recognition = null;
    this.requested = false;
    this.listening = false;
    this.restartTimer = null;
    this.metrics = this.createMetrics();
  }

  static supported() {
    const root = browserGlobals();
    return Boolean(root.SpeechRecognition || root.webkitSpeechRecognition);
  }

  createMetrics() {
    return {
      provider: ASR_PROVIDERS.browser,
      startedAt: null,
      firstPartialMs: null,
      firstFinalMs: null,
      partialRevisions: 0,
      finalSegments: 0,
      restarts: 0,
      errors: [],
      lastPartial: "",
    };
  }

  setLanguage(language) {
    this.language = normalizeBrowserSpeechLanguage(language);
    if (this.recognition && !this.listening) this.recognition.lang = language;
  }

  start() {
    if (!BrowserSpeechAdapter.supported()) throw new Error("当前浏览器不支持 Web Speech API");
    if (this.requested || this.listening) return;
    this.requested = true;
    this.metrics = this.createMetrics();
    this.metrics.startedAt = now();
    this.startRecognition();
  }

  stop() {
    this.requested = false;
    browserGlobals().clearTimeout?.(this.restartTimer);
    if (!this.recognition) return;
    try { this.recognition.stop(); } catch {}
  }

  startRecognition() {
    const root = browserGlobals();
    const SpeechRecognition = root.SpeechRecognition || root.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = this.language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.onstart = () => {
      this.listening = true;
      this.emit("status", { status: "listening", provider: ASR_PROVIDERS.browser });
    };
    recognition.onend = () => {
      this.listening = false;
      if (!this.requested) {
        this.emit("status", { status: "idle", provider: ASR_PROVIDERS.browser });
        return;
      }
      this.metrics.restarts += 1;
      this.emit("status", { status: "reconnecting", provider: ASR_PROVIDERS.browser });
      this.restartTimer = root.setTimeout?.(() => this.startRecognition(), 250);
    };
    recognition.onerror = (event) => {
      const error = event.error || "unknown";
      this.metrics.errors.push({ error, atMs: this.elapsed() });
      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(error)) this.requested = false;
      this.emit("error", { error, message: event.message || "", provider: ASR_PROVIDERS.browser });
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const chosen = chooseAlternative(result);
        if (!chosen) continue;
        const alternatives = Array.from(result).map((alternative) => ({
          text: String(alternative.transcript || "").trim(),
          confidence: Number.isFinite(alternative.confidence) ? alternative.confidence : null,
        }));
        if (result.isFinal) {
          this.markFirst("firstFinalMs");
          this.metrics.finalSegments += 1;
          this.emit("transcript", {
            text: chosen.text,
            isFinal: true,
            confidence: chosen.confidence,
            alternatives,
            elapsedMs: this.elapsed(),
            provider: ASR_PROVIDERS.browser,
          });
        } else {
          interim += chosen.text;
        }
      }
      if (!interim) return;
      this.emitPartial(interim);
    };
    this.recognition = recognition;
    try {
      recognition.start();
    } catch (error) {
      this.requested = false;
      this.emit("error", { error: "start-failed", message: error.message, provider: ASR_PROVIDERS.browser });
    }
  }

  emitPartial(text) {
    this.markFirst("firstPartialMs");
    if (this.metrics.lastPartial && this.metrics.lastPartial !== text) this.metrics.partialRevisions += 1;
    this.metrics.lastPartial = text;
    this.emit("transcript", {
      text,
      isFinal: false,
      confidence: null,
      alternatives: [],
      elapsedMs: this.elapsed(),
      provider: ASR_PROVIDERS.browser,
    });
  }

  elapsed() {
    return elapsedSince(this.metrics.startedAt);
  }

  markFirst(field) {
    if (this.metrics[field] === null) this.metrics[field] = this.elapsed();
  }

  snapshot() {
    return { ...this.metrics, listening: this.listening, requested: this.requested, language: this.language };
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

export class WhisperLiveKitAdapter extends EventTarget {
  constructor({ language = "zh-CN", endpoint = DEFAULT_WHISPER_LIVEKIT_ENDPOINT, chunkMs = 300 } = {}) {
    super();
    this.language = language;
    this.endpoint = endpoint || DEFAULT_WHISPER_LIVEKIT_ENDPOINT;
    this.chunkMs = chunkMs;
    this.socket = null;
    this.stream = null;
    this.recorder = null;
    this.audioContext = null;
    this.processor = null;
    this.source = null;
    this.silentGain = null;
    this.requested = false;
    this.listening = false;
    this.captureStarted = false;
    this.configTimer = null;
    this.finalLineKeys = new Set();
    this.metrics = this.createMetrics();
  }

  static supported() {
    const { root, navigator: mediaNavigator } = mediaGlobals();
    return Boolean(root.WebSocket && mediaNavigator?.mediaDevices?.getUserMedia);
  }

  createMetrics() {
    return {
      provider: ASR_PROVIDERS.whisperLiveKit,
      endpoint: this.endpoint,
      startedAt: null,
      firstPartialMs: null,
      firstFinalMs: null,
      partialRevisions: 0,
      finalSegments: 0,
      restarts: 0,
      errors: [],
      lastPartial: "",
      audioMode: "pending",
      socketState: "idle",
    };
  }

  setLanguage(language) {
    this.language = language;
  }

  setEndpoint(endpoint) {
    this.endpoint = endpoint || DEFAULT_WHISPER_LIVEKIT_ENDPOINT;
  }

  async start() {
    if (!WhisperLiveKitAdapter.supported()) throw new Error("当前浏览器不支持本地流式 ASR 所需的 WebSocket 或麦克风采集");
    if (this.requested || this.listening) return;
    this.requested = true;
    this.captureStarted = false;
    this.finalLineKeys.clear();
    this.metrics = this.createMetrics();
    this.metrics.startedAt = now();
    try {
      const { navigator: mediaNavigator } = mediaGlobals();
      this.stream = await mediaNavigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.openSocket();
    } catch (error) {
      this.requested = false;
      this.recordError("microphone", error.message || String(error));
      this.emit("error", { error: "microphone", message: error.message || String(error), provider: ASR_PROVIDERS.whisperLiveKit });
      this.cleanup();
    }
  }

  stop() {
    this.requested = false;
    this.endStreamSignal();
    this.cleanup();
    this.emitStatus("idle");
  }

  openSocket() {
    const root = browserGlobals();
    const url = buildWhisperLiveKitUrl(this.endpoint, this.language);
    this.metrics.endpoint = url;
    this.metrics.socketState = "connecting";
    const socket = new root.WebSocket(url);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      this.metrics.socketState = "open";
      this.listening = true;
      this.emitStatus("listening");
      this.configTimer = root.setTimeout?.(() => {
        if (!this.captureStarted) this.startMediaRecorderCapture();
      }, 650);
    };
    socket.onmessage = (event) => this.handleSocketMessage(event.data);
    socket.onerror = () => {
      this.recordError("socket", `无法连接 ${url}`);
      this.emit("error", { error: "socket", message: `无法连接本地语音服务：${url}。请启动本地语音服务后重试。`, provider: ASR_PROVIDERS.whisperLiveKit });
    };
    socket.onclose = () => {
      this.metrics.socketState = "closed";
      this.listening = false;
      if (this.requested) {
        this.requested = false;
        this.emit("error", { error: "closed", message: "本地语音服务连接已关闭，请检查服务后重试。", provider: ASR_PROVIDERS.whisperLiveKit });
      }
      this.cleanup({ keepSocket: true });
      this.emitStatus("idle");
    };
    this.socket = socket;
  }

  handleSocketMessage(data) {
    if (typeof data !== "string") return;
    const parsed = parseWhisperLiveKitMessage(data);
    if (parsed.config && !this.captureStarted) {
      const usePcm = Boolean(parsed.config.useAudioWorklet || parsed.config.use_audio_worklet || parsed.config.pcmInput || parsed.config.pcm_input);
      if (usePcm) this.startPcmCapture();
      else this.startMediaRecorderCapture();
    }
    for (const line of parsed.finalLines) {
      const key = line.key || line.text;
      if (!line.text || this.finalLineKeys.has(key)) continue;
      this.finalLineKeys.add(key);
      this.emitFinal(line.text);
    }
    if (parsed.partialText) this.emitPartial(parsed.partialText);
  }

  startMediaRecorderCapture() {
    if (this.captureStarted || !this.stream || !this.socketOpen()) return;
    const root = browserGlobals();
    const MediaRecorder = root.MediaRecorder;
    if (!MediaRecorder) {
      this.startPcmCapture();
      return;
    }
    const mimeType = chooseRecorderMimeType(MediaRecorder);
    try {
      this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    } catch {
      this.startPcmCapture();
      return;
    }
    this.captureStarted = true;
    this.metrics.audioMode = "media-recorder";
    this.recorder.ondataavailable = async (event) => {
      if (!event.data?.size || !this.socketOpen()) return;
      this.socket.send(await event.data.arrayBuffer());
    };
    this.recorder.onerror = (event) => {
      this.recordError("recorder", event.error?.message || "MediaRecorder error");
      this.emit("error", { error: "recorder", message: event.error?.message || "MediaRecorder error", provider: ASR_PROVIDERS.whisperLiveKit });
    };
    this.recorder.start(this.chunkMs);
  }

  async startPcmCapture() {
    if (this.captureStarted || !this.stream || !this.socketOpen()) return;
    const root = browserGlobals();
    const AudioContext = root.AudioContext || root.webkitAudioContext;
    if (!AudioContext) {
      this.emit("error", { error: "audio-context", message: "当前浏览器不支持 AudioContext PCM 采集", provider: ASR_PROVIDERS.whisperLiveKit });
      return;
    }
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    if (this.audioContext.state === "suspended") await this.audioContext.resume().catch(() => {});
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;
    this.processor.onaudioprocess = (event) => {
      if (!this.socketOpen()) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = floatTo16BitPcm(downsample(input, this.audioContext.sampleRate, 16000));
      if (pcm.byteLength) this.socket.send(pcm);
    };
    this.source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
    this.captureStarted = true;
    this.metrics.audioMode = "pcm-16khz";
  }

  emitPartial(text) {
    const clean = cleanTranscript(text);
    if (!clean) return;
    this.markFirst("firstPartialMs");
    if (this.metrics.lastPartial && this.metrics.lastPartial !== clean) this.metrics.partialRevisions += 1;
    this.metrics.lastPartial = clean;
    this.emit("transcript", {
      text: clean,
      isFinal: false,
      confidence: null,
      alternatives: [],
      elapsedMs: this.elapsed(),
      provider: ASR_PROVIDERS.whisperLiveKit,
    });
  }

  emitFinal(text) {
    const clean = cleanTranscript(text);
    if (!clean) return;
    this.markFirst("firstFinalMs");
    this.metrics.finalSegments += 1;
    this.emit("transcript", {
      text: clean,
      isFinal: true,
      confidence: null,
      alternatives: [{ text: clean, confidence: null }],
      elapsedMs: this.elapsed(),
      provider: ASR_PROVIDERS.whisperLiveKit,
    });
  }

  endStreamSignal() {
    if (!this.socketOpen()) return;
    try { this.socket.send(new ArrayBuffer(0)); } catch {}
  }

  cleanup(options = {}) {
    const root = browserGlobals();
    root.clearTimeout?.(this.configTimer);
    this.configTimer = null;
    if (this.recorder && this.recorder.state !== "inactive") {
      try { this.recorder.stop(); } catch {}
    }
    this.recorder = null;
    this.processor?.disconnect?.();
    this.source?.disconnect?.();
    this.silentGain?.disconnect?.();
    this.processor = null;
    this.source = null;
    this.silentGain = null;
    if (this.audioContext) this.audioContext.close?.().catch?.(() => {});
    this.audioContext = null;
    this.stream?.getTracks?.().forEach((track) => track.stop());
    this.stream = null;
    this.captureStarted = false;
    if (!options.keepSocket && this.socket) {
      try { this.socket.close(); } catch {}
    }
    if (!options.keepSocket) this.socket = null;
  }

  socketOpen() {
    return this.socket?.readyState === 1;
  }

  elapsed() {
    return elapsedSince(this.metrics.startedAt);
  }

  markFirst(field) {
    if (this.metrics[field] === null) this.metrics[field] = this.elapsed();
  }

  recordError(error, message) {
    this.metrics.errors.push({ error, message, atMs: this.elapsed() });
  }

  emitStatus(status) {
    this.emit("status", { status, provider: ASR_PROVIDERS.whisperLiveKit });
  }

  snapshot() {
    return { ...this.metrics, listening: this.listening, requested: this.requested, language: this.language };
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

export function asrProviderSupported(provider) {
  return normalizeAsrProvider(provider) === ASR_PROVIDERS.whisperLiveKit
    ? WhisperLiveKitAdapter.supported()
    : BrowserSpeechAdapter.supported();
}

export function createAsrAdapter(options = {}) {
  return normalizeAsrProvider(options.provider) === ASR_PROVIDERS.whisperLiveKit
    ? new WhisperLiveKitAdapter(options)
    : new BrowserSpeechAdapter(options);
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function normalizeLines(lines) {
  const array = Array.isArray(lines) ? lines : (lines ? [lines] : []);
  return array.map((line, index) => {
    const text = cleanTranscript(typeof line === "string" ? line : (line.text || line.transcript || line.transcription || ""));
    const start = typeof line === "object" && Number.isFinite(line.start) ? line.start : "";
    const end = typeof line === "object" && Number.isFinite(line.end) ? line.end : "";
    return text ? { text, key: `${start}:${end}:${text}:${index}` } : null;
  }).filter(Boolean);
}

function cleanTranscript(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function chooseRecorderMimeType(MediaRecorder) {
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ].find((type) => MediaRecorder.isTypeSupported?.(type));
}

function downsample(buffer, inputRate, outputRate) {
  if (!buffer.length || inputRate === outputRate) return buffer;
  const ratio = inputRate / outputRate;
  const length = Math.floor(buffer.length / ratio);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(buffer.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += buffer[j];
    result[i] = sum / Math.max(1, end - start);
  }
  return result;
}

function floatTo16BitPcm(float32) {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}
