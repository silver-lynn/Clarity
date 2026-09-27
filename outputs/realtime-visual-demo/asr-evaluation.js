function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = left[row - 1] === right[column - 1]
        ? diagonal
        : Math.min(diagonal, above, previous[column - 1]) + 1;
      diagonal = above;
    }
  }
  return previous[right.length];
}

function score(reference, hypothesis, tokenizer) {
  const expected = tokenizer(normalizeText(reference));
  const actual = tokenizer(normalizeText(hypothesis));
  if (!expected.length) return null;
  const errors = editDistance(expected, actual);
  return {
    errors,
    total: expected.length,
    rate: errors / expected.length,
    accuracy: Math.max(0, 1 - errors / expected.length),
  };
}

export function evaluateTranscript(reference, hypothesis) {
  return {
    cer: score(reference, hypothesis, (text) => [...text.replace(/\s/g, "")]),
    wer: score(reference, hypothesis, (text) => text ? text.split(" ") : []),
  };
}

export class AsrEvaluationSession {
  constructor({ reference = "", language = "zh-CN", provider = "browser-web-speech" } = {}) {
    this.reference = reference;
    this.language = language;
    this.provider = provider;
    this.startedAt = performance.now();
    this.firstVoiceAt = null;
    this.firstPartialAt = null;
    this.firstFinalAt = null;
    this.partialRevisions = 0;
    this.lastPartial = "";
    this.finalSegments = [];
  }

  markVoice(timestamp = performance.now()) {
    if (this.firstVoiceAt === null) this.firstVoiceAt = timestamp;
  }

  addTranscript(detail, timestamp = performance.now()) {
    if (detail.isFinal) {
      if (this.firstFinalAt === null) this.firstFinalAt = timestamp;
      this.finalSegments.push(detail.text);
      this.lastPartial = "";
      return;
    }
    if (this.firstPartialAt === null) this.firstPartialAt = timestamp;
    if (this.lastPartial && this.lastPartial !== detail.text) this.partialRevisions += 1;
    this.lastPartial = detail.text;
  }

  finish() {
    const endedAt = performance.now();
    const hypothesis = this.finalSegments.join(" ").trim() || this.lastPartial;
    const origin = this.firstVoiceAt ?? this.startedAt;
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      provider: this.provider,
      language: this.language,
      durationMs: Math.round(endedAt - this.startedAt),
      firstVoiceMs: this.firstVoiceAt === null ? null : Math.round(this.firstVoiceAt - this.startedAt),
      firstPartialLatencyMs: this.firstPartialAt === null ? null : Math.max(0, Math.round(this.firstPartialAt - origin)),
      firstFinalLatencyMs: this.firstFinalAt === null ? null : Math.max(0, Math.round(this.firstFinalAt - origin)),
      partialRevisions: this.partialRevisions,
      reference: this.reference.trim(),
      hypothesis,
      ...evaluateTranscript(this.reference, hypothesis),
    };
  }
}

export async function createAudioCapture(onVoice) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const chunks = [];
  const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? { mimeType: "audio/webm;codecs=opus" } : undefined);
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let voiceFrames = 0;
  let animationFrame = 0;
  let voiceDetected = false;

  const inspect = () => {
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    voiceFrames = rms > 0.025 ? voiceFrames + 1 : Math.max(0, voiceFrames - 1);
    if (!voiceDetected && voiceFrames >= 3) {
      voiceDetected = true;
      onVoice?.(performance.now());
    }
    animationFrame = requestAnimationFrame(inspect);
  };

  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
  const stopped = new Promise((resolve) => recorder.addEventListener("stop", async () => {
    cancelAnimationFrame(animationFrame);
    stream.getTracks().forEach((track) => track.stop());
    await context.close();
    resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
  }, { once: true }));
  recorder.start(250);
  inspect();
  return {
    async stop() {
      if (recorder.state !== "inactive") recorder.stop();
      return stopped;
    },
  };
}

export function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
