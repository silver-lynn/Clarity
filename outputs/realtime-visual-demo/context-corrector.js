const DOMAIN_CONTEXT = /\b(?:presentation|presentations|slide|slides|speaker|voice|audio|topic|evidence|argument|visual|canvas|structure|text|power\s*point|powerpoint|whisper|minilm|livecanvas)\b/i;
const GLOSSARY_SPLIT = /\s*[,，、;；]\s*/;

const RULES = [
  {
    id: "live-visual-canvas",
    pattern: /\b(?:library\s+canvas|life\s+visual\s+canvas|light\s+visual\s+canvas|live\s+usual\s+canvas|live\s+ritual\s+canvas|live\s+view\s+canvas|live\s+video\s+canvas|live\s+visual\s+campus)\b/gi,
    replacement: "live visual canvas",
    reason: "domain phrase",
  },
  {
    id: "stable-text",
    pattern: /\bstable\s+(?:tax|tags|tech|test|task|texts)\b/gi,
    replacement: "stable text",
    reason: "domain phrase",
    when: hasDomainContext,
  },
  {
    id: "goal-not-girl",
    pattern: /\b(?:the\s+)?girl\s+is\s+(not\s+to\s+create\s+more\s+slides|to\s+make\s+the\s+argument(?:\s+easier\s+to\s+understand)?)\b/gi,
    replacement(match, tail) {
      return `${/^the\s/i.test(match) ? "the " : ""}goal is ${tail}`;
    },
    reason: "contextual homophone",
    when: hasDomainContext,
  },
  {
    id: "go-is-goal-is",
    pattern: /\bgo\s+is\s+(not\s+to\s+create\s+more\s+slides|to\s+make\s+the\s+argument(?:\s+easier\s+to\s+understand)?)\b/gi,
    replacement(match, tail) {
      return `goal is ${tail}`;
    },
    reason: "contextual homophone",
    when: hasDomainContext,
  },
  {
    id: "converts-the-audio",
    pattern: /\bconvers(?:e|ed|es|ing)?\s+(?:of\s+|the\s+)?audio\b/gi,
    replacement: "converts the audio",
    reason: "domain verb",
  },
  {
    id: "converts-audio-article",
    pattern: /\bconverts\s+audio\b/gi,
    replacement: "converts the audio",
    reason: "domain phrase",
  },
  {
    id: "speaker-voice",
    pattern: /\bspeakers\s+voice\b/gi,
    replacement: "speaker's voice",
    reason: "domain phrase",
  },
  {
    id: "relationships-between-ideas",
    pattern: /\b(?:relation\s+ships?|relations)\s+between\s+ideas\b/gi,
    replacement: "relationships between ideas",
    reason: "domain phrase",
  },
  {
    id: "visual-structure",
    pattern: /\bvisual\s+structures\b/gi,
    replacement: "visual structure",
    reason: "domain phrase",
  },
  {
    id: "editable-powerpoint",
    pattern: /\b(?:edible|editable)\s+power\s*point\b/gi,
    replacement: "editable PowerPoint",
    reason: "product phrase",
  },
  {
    id: "powerpoint",
    pattern: /\bpower\s+point\b/gi,
    replacement: "PowerPoint",
    reason: "product phrase",
  },
  {
    id: "minilm",
    pattern: /\bmini\s*l\s*m\b/gi,
    replacement: "MiniLM",
    reason: "model name",
  },
  {
    id: "openai",
    pattern: /\bopen\s*a\s*i\b/gi,
    replacement: "OpenAI",
    reason: "company name",
  },
  {
    id: "whisper",
    pattern: /\bwhis\s*per\b/gi,
    replacement: "Whisper",
    reason: "model name",
  },
];

export function createContextCorrector(options = {}) {
  return new ContextCorrector(options);
}

export class ContextCorrector {
  constructor(options = {}) {
    this.builtInRules = options.rules || RULES;
    this.glossaryEntries = normalizeGlossaryEntries(options.glossaryEntries || []);
    this.reset();
  }

  reset() {
    this.history = [];
    this.finalSegments = [];
    this.seenCorrectionSignatures = new Set();
    this.metrics = {
      examinedSegments: 0,
      correctedSegments: 0,
      corrections: 0,
      glossaryCorrections: 0,
      lastRawText: "",
      lastCorrectedText: "",
      recentCorrections: [],
      recentSegments: [],
    };
  }

  setGlossaryEntries(entries = []) {
    this.glossaryEntries = normalizeGlossaryEntries(entries);
  }

  activeRules() {
    return [...this.builtInRules, ...glossaryRules(this.glossaryEntries)];
  }

  observe(payload = {}) {
    const rawText = normalizeSpaces(payload.text);
    const captionText = normalizeSpaces(payload.captionText || rawText);
    const context = { history: this.history, glossaryEntries: this.glossaryEntries };
    const rules = this.activeRules();
    const result = correctText(rawText, context, rules);
    const caption = captionText === rawText
      ? result.correctedText
      : correctText(captionText, context, rules).correctedText;

    this.record(result, Boolean(payload.isFinal), payload.usedForDrawing !== false);
    return {
      ...result,
      captionText: caption,
      isFinal: Boolean(payload.isFinal),
      usedForDrawing: payload.usedForDrawing !== false,
      label: result.changed ? "CTX" : "",
    };
  }

  preview(text) {
    return correctText(text, { history: this.history, glossaryEntries: this.glossaryEntries }, this.activeRules());
  }

  record(result, isFinal, usedForDrawing = true) {
    if (!result.rawText) return;
    this.metrics.examinedSegments += 1;
    this.metrics.lastRawText = result.rawText;
    this.metrics.lastCorrectedText = result.correctedText;

    if (result.changed) {
      const signature = `${result.rawText}=>${result.correctedText}`;
      if (!this.seenCorrectionSignatures.has(signature)) {
        this.seenCorrectionSignatures.add(signature);
        this.metrics.correctedSegments += 1;
        this.metrics.corrections += result.corrections.length;
        this.metrics.glossaryCorrections += result.corrections.filter((item) => item.source === "glossary").length;
        this.metrics.recentCorrections = [
          ...this.metrics.recentCorrections,
          ...result.corrections.map(({ from, to, reason, source }) => ({ from, to, reason, source })),
        ].slice(-8);
        this.metrics.recentSegments = [
          ...this.metrics.recentSegments,
          {
            from: result.rawText,
            to: result.correctedText,
            usedForDrawing,
            isFinal,
            corrections: result.corrections.map(({ from, to, reason, source }) => ({ from, to, reason, source })),
          },
        ].slice(-8);
      }
    }

    if (result.correctedText) {
      this.history = [...this.history, result.correctedText].slice(-8);
      if (isFinal) this.finalSegments.push(result.correctedText);
    }
  }

  snapshot() {
    return {
      ...this.metrics,
      finalTranscript: this.finalSegments.join(" ").trim(),
      contextWindow: [...this.history],
      glossaryEntries: this.glossaryEntries.map((entry) => ({ ...entry, variants: [...entry.variants] })),
      glossaryEntryCount: this.glossaryEntries.length,
    };
  }
}

export function correctText(value, context = {}, rules = RULES) {
  const rawText = normalizeSpaces(value);
  if (!rawText) return { rawText: "", correctedText: "", changed: false, corrections: [] };

  let correctedText = rawText;
  const corrections = [];
  for (const rule of rules) {
    if (rule.when && !rule.when(correctedText, context)) continue;
    correctedText = applyRule(correctedText, rule, corrections);
  }
  correctedText = normalizeSpaces(correctedText);
  return {
    rawText,
    correctedText,
    changed: correctedText !== rawText,
    corrections,
  };
}

function applyRule(text, rule, corrections) {
  return text.replace(rule.pattern, (...args) => {
    const match = args[0];
    const groups = args.slice(1, -2);
    const replacement = typeof rule.replacement === "function"
      ? rule.replacement(match, ...groups)
      : rule.replacement;
    const next = fitCase(match, replacement);
    if (next === match) return match;
    corrections.push({ from: match, to: next, rule: rule.id, reason: rule.reason, source: rule.source || "built-in" });
    return next;
  });
}

function hasDomainContext(text, context = {}) {
  const joined = [text, ...(context.history || [])].join(" ");
  return DOMAIN_CONTEXT.test(joined);
}

function fitCase(source, replacement) {
  if (!source || !replacement) return replacement;
  if (/^[A-Z\s'-]+$/.test(source) && /[A-Z]/.test(source)) return replacement.toUpperCase();
  if (/^[A-Z]/.test(source)) return `${replacement[0].toUpperCase()}${replacement.slice(1)}`;
  return replacement;
}

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function parseGlossaryText(value) {
  const entries = [];
  const errors = [];
  const seen = new Set();
  String(value || "").split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const separator = line.indexOf("=");
    if (separator < 0) {
      errors.push({ line: index + 1, message: "缺少 =" });
      return;
    }
    const term = normalizeSpaces(line.slice(0, separator));
    const variants = splitVariants(line.slice(separator + 1)).filter((variant) => variant && variant.toLowerCase() !== term.toLowerCase());
    if (!term || !variants.length) {
      errors.push({ line: index + 1, message: "缺少正确术语或误听写法" });
      return;
    }
    const key = `${term.toLowerCase()}=>${variants.map((item) => item.toLowerCase()).sort().join("|")}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ term, variants, kind: "user", source: "local-glossary" });
  });
  return { entries: normalizeGlossaryEntries(entries), errors };
}

export function formatGlossaryEntries(entries = []) {
  return normalizeGlossaryEntries(entries)
    .map((entry) => `${entry.term} = ${entry.variants.join(", ")}`)
    .join("\n");
}

export function normalizeGlossaryEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const term = normalizeSpaces(entry?.term);
      const variants = splitVariants(entry?.variants || []);
      return term && variants.length ? {
        term,
        variants: [...new Set(variants.filter((variant) => variant.toLowerCase() !== term.toLowerCase()))],
        kind: normalizeSpaces(entry?.kind || "user"),
        source: normalizeSpaces(entry?.source || "local-glossary"),
      } : null;
    })
    .filter(Boolean);
}

function splitVariants(value) {
  if (Array.isArray(value)) return value.map(normalizeSpaces).filter(Boolean);
  return String(value || "").split(GLOSSARY_SPLIT).map(normalizeSpaces).filter(Boolean);
}

function glossaryRules(entries = []) {
  const rules = [];
  normalizeGlossaryEntries(entries).forEach((entry, entryIndex) => {
    entry.variants.forEach((variant, variantIndex) => {
      const pattern = phrasePattern(variant);
      if (!pattern) return;
      rules.push({
        id: `glossary-${entryIndex + 1}-${variantIndex + 1}`,
        pattern,
        replacement: entry.term,
        reason: `local glossary: ${entry.term}`,
        source: "glossary",
      });
    });
  });
  return rules;
}

function phrasePattern(phrase) {
  const normalized = normalizeSpaces(phrase);
  if (!normalized) return null;
  const escaped = escapeRegExp(normalized).replace(/\\ /g, "\\s+");
  const before = /^[A-Za-z0-9]/.test(normalized) ? "\\b" : "";
  const after = /[A-Za-z0-9]$/.test(normalized) ? "\\b" : "";
  return new RegExp(`${before}${escaped}${after}`, "giu");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const contextCorrectorInternals = { RULES, correctText, hasDomainContext, fitCase, glossaryRules, phrasePattern };
