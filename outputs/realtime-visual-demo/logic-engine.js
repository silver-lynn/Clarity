const explicitVisualTypes = new Set(["process", "relation", "list", "compare", "pie", "bar"]);
const logicTypes = new Set(["claim_evidence", "problem_solution", "cause_effect"]);

export function createLogicMemory() {
  return {
    sequence: 0,
    current: null,
    lastProposition: "",
    lastUpdatedAt: 0,
  };
}

export function resetLogicMemory(memory) {
  memory.sequence = 0;
  memory.current = null;
  memory.lastProposition = "";
  memory.lastUpdatedAt = 0;
}

export function composeLogicEvent(memory, baseEvent, rawText, options = {}) {
  const text = normalize(rawText);
  if (!text) return baseEvent;
  const confirmed = Boolean(options.confirmed);
  const timestamp = Number.isFinite(options.timestamp) ? options.timestamp : Date.now();
  const topic = options.topic || "";

  if (timestamp - memory.lastUpdatedAt > 65000) memory.current = null;

  if (baseEvent.type === "theme" || explicitVisualTypes.has(baseEvent.type) || baseEvent.holdStructure) {
    if (confirmed) {
      memory.current = null;
      memory.lastProposition = compact(text);
      memory.lastUpdatedAt = timestamp;
    }
    return baseEvent;
  }

  const directCause = extractCauseEffect(text);
  if (directCause) {
    return commitOrPreview(memory, {
      type: "cause_effect",
      subject: directCause.cause,
      items: [directCause.effect],
      secondaryItems: [],
    }, { confirmed, timestamp, topic, sourceText: text });
  }

  const leadingCause = extractLeadingCause(text);
  if (leadingCause) {
    return commitOrPreview(memory, {
      type: "cause_effect",
      subject: leadingCause,
      items: [],
      secondaryItems: [],
    }, { confirmed, timestamp, topic, sourceText: text });
  }

  const problem = extractProblem(text);
  const solution = extractSolution(text);
  if (problem && solution) {
    return commitOrPreview(memory, {
      type: "problem_solution",
      subject: problem,
      items: [solution],
      secondaryItems: [],
    }, { confirmed, timestamp, topic, sourceText: text });
  }

  if (problem) {
    return commitOrPreview(memory, {
      type: "problem_solution",
      subject: problem,
      items: [],
      secondaryItems: [],
    }, { confirmed, timestamp, topic, sourceText: text });
  }

  const current = freshCurrent(memory, timestamp);
  if (solution && current?.type === "problem_solution") {
    return extendCurrent(memory, current, "items", solution, { confirmed, timestamp, sourceText: text });
  }

  const effect = extractEffect(text);
  if (effect && current?.type === "cause_effect") {
    return extendCurrent(memory, current, "items", effect, { confirmed, timestamp, sourceText: text });
  }
  if (effect && memory.lastProposition) {
    return commitOrPreview(memory, {
      type: "cause_effect",
      subject: memory.lastProposition,
      items: [effect],
      secondaryItems: [],
    }, { confirmed, timestamp, topic, sourceText: text });
  }

  const evidence = extractEvidence(text);
  if (evidence) {
    if (current?.type === "claim_evidence") {
      return extendCurrent(memory, current, "items", evidence, { confirmed, timestamp, sourceText: text });
    }
    if (current?.type === "problem_solution") {
      return extendCurrent(memory, current, "secondaryItems", evidence, { confirmed, timestamp, sourceText: text });
    }
    if (memory.lastProposition) {
      return commitOrPreview(memory, {
        type: "claim_evidence",
        subject: memory.lastProposition,
        items: [evidence],
        secondaryItems: [],
      }, { confirmed, timestamp, topic, sourceText: text });
    }
  }

  const claim = extractClaim(text) || (baseEvent.type === "insight" ? compact(baseEvent.items?.[0] || text) : "");
  if (claim) {
    return commitOrPreview(memory, {
      type: "claim_evidence",
      subject: claim,
      items: [],
      secondaryItems: [],
    }, { confirmed, timestamp, topic, sourceText: text });
  }

  if (confirmed) {
    if (memory.current) {
      memory.current.driftCount = (memory.current.driftCount || 0) + 1;
      if (memory.current.driftCount >= 2) memory.current = null;
    }
    memory.lastProposition = compact(text);
    memory.lastUpdatedAt = timestamp;
  }
  return baseEvent;
}

function freshCurrent(memory, timestamp) {
  if (!memory.current || timestamp - memory.current.updatedAt > 65000) return null;
  return memory.current;
}

function commitOrPreview(memory, seed, context) {
  const current = freshCurrent(memory, context.timestamp);
  const canReuse = current && current.type === seed.type && similar(current.subject, seed.subject) >= 0.42;
  const unit = canReuse ? cloneUnit(current) : {
    logicId: context.confirmed ? `logic-${++memory.sequence}` : `logic-preview-${seed.type}`,
    type: seed.type,
    subject: compact(seed.subject),
    items: [],
    secondaryItems: [],
    topic: context.topic,
    sentenceCount: 0,
    driftCount: 0,
    updatedAt: context.timestamp,
    sourceTexts: [],
  };
  unit.subject = compact(seed.subject || unit.subject);
  unit.items = mergeItems(unit.items, seed.items);
  unit.secondaryItems = mergeItems(unit.secondaryItems, seed.secondaryItems);
  unit.updatedAt = context.timestamp;
  unit.sentenceCount += 1;
  unit.driftCount = 0;
  unit.sourceTexts = [...unit.sourceTexts, context.sourceText].slice(-6);
  if (context.confirmed) {
    memory.current = unit;
    memory.lastProposition = unit.subject;
    memory.lastUpdatedAt = context.timestamp;
  }
  return logicEvent(unit, !context.confirmed);
}

function extendCurrent(memory, current, field, value, context) {
  const unit = cloneUnit(current);
  unit[field] = mergeItems(unit[field], [value]);
  unit.updatedAt = context.timestamp;
  unit.sentenceCount += 1;
  unit.driftCount = 0;
  unit.sourceTexts = [...unit.sourceTexts, context.sourceText].slice(-6);
  if (context.confirmed) {
    memory.current = unit;
    memory.lastUpdatedAt = context.timestamp;
  }
  return logicEvent(unit, !context.confirmed);
}

function logicEvent(unit, provisional) {
  const titles = {
    claim_evidence: "观点正在获得支持",
    problem_solution: "从问题走向方案",
    cause_effect: "原因如何产生结果",
  };
  return {
    type: unit.type,
    title: titles[unit.type],
    subject: unit.subject,
    items: [...unit.items],
    secondaryItems: [...unit.secondaryItems],
    logicId: unit.logicId,
    logicTopic: unit.topic,
    lifecycle: provisional ? "open" : "confirmed",
    sentenceCount: unit.sentenceCount,
  };
}

function extractProblem(text) {
  const patterns = [
    /(?:问题|挑战|难点|痛点|障碍|不足|局限)(?:是|在于|就是|就在于|来自|源于|：|:)\s*(.+?)(?:[。.!?]|$)/,
    /(?:面临|面对|遇到|存在)(?:着|的)?(?:一个|一种|这个|这些)?(?:问题|挑战|难点|痛点|障碍)(?:是|在于|就是|：|:)?\s*(.+?)(?:[。.!?]|$)/,
    /(?:the\s+)?(?:problem|challenge|issue|difficulty|obstacle|barrier|limitation)(?:\s+is|\s+was|\s+lies?\s+in|\s+comes?\s+from|\s*:)\s*(.+?)(?:[.!?]|$)/i,
    /(?:face|facing|encounter|have)\s+(?:a|the|this)?\s*(?:problem|challenge|issue|difficulty|obstacle|barrier)(?:\s+with|\s+in|\s*:)?\s*(.+?)(?:[.!?]|$)/i,
    /(?:we|people|users?|teams?)\s+(?:struggle|fail|cannot|can't|are\s+unable)\s+(.+?)(?:[.!?]|$)/i,
  ];
  return firstCapture(text, patterns);
}

function extractSolution(text) {
  const patterns = [
    /(?:解决办法|解决方案|方案|办法)(?:是|在于|就是|：|:)?\s*(.+?)(?:[。.!?]|$)/,
    /(?:为了解决(?:这个|这一)?问题|要解决(?:这个|这一)?问题)(?:，|,)?\s*(.+?)(?:[。.!?]|$)/,
    /(?:我们|你们|人们)(?:需要|应该|可以|必须)\s*(.+?)(?:[。.!?]|$)/,
    /(?:the\s+)?solution(?:\s+is|\s+was|\s*:)?\s*(.+?)(?:[.!?]|$)/i,
    /(?:to\s+(?:solve|address|fix)\s+(?:this|the\s+problem)|one\s+way\s+is|the\s+answer\s+is)(?:,|:)?\s*(.+?)(?:[.!?]|$)/i,
    /(?:we|you|teams?|organizations?)\s+(?:need|should|can|must)\s+to\s+(.+?)(?:[.!?]|$)/i,
  ];
  return firstCapture(text, patterns);
}

function extractClaim(text) {
  const patterns = [
    /(?:我认为|我们认为|关键是|核心是|结论是|最重要的是|要点是|这说明|这意味着)(?:，|,|：|:)?\s*(.+?)(?:[。.!?]|$)/,
    /(?:the\s+(?:main\s+)?point\s+is|the\s+key\s+is|the\s+idea\s+is|the\s+conclusion\s+is|the\s+takeaway\s+is|the\s+bottom\s+line\s+is)(?:\s+that)?\s*(.+?)(?:[.!?]|$)/i,
    /what(?:'s|\s+is)\s+(?:really\s+)?important(?:\s+to\s+know)?\s+is(?:\s+that)?\s*(.+?)(?:[.!?]|$)/i,
    /(?:I|we)\s+(?:think|believe|argue|found)\s+(?:that\s+)?(.+?)(?:[.!?]|$)/i,
  ];
  return firstCapture(text, patterns);
}

function extractEvidence(text) {
  const patterns = [
    /^(?:例如|比如|举例来说|以.+?为例|因为|这是因为|数据显示|研究表明|实验表明|证据是)(?:，|,|：|:)?\s*(.+?)(?:[。.!?]|$)/,
    /^(?:for\s+example|for\s+instance|as\s+an\s+example|because|this\s+is\s+because|data\s+(?:shows?|suggests?)|research\s+(?:shows?|suggests?)|the\s+evidence\s+is)(?:,|:)?\s*(.+?)(?:[.!?]|$)/i,
  ];
  return firstCapture(text, patterns);
}

function extractEffect(text) {
  const patterns = [
    /^(?:所以|因此|结果|从而|这意味着|这样一来)(?:，|,|：|:)?\s*(.+?)(?:[。.!?]|$)/,
    /^(?:therefore|as\s+a\s+result|consequently|this\s+means|which\s+means)(?:,|:)?\s*(.+?)(?:[.!?]|$)/i,
  ];
  return firstCapture(text, patterns);
}

function extractCauseEffect(text) {
  const patterns = [
    { pattern: /(?:因为|由于)(.+?)(?:，|,)?(?:所以|因此|从而)(.+?)(?:[。.!?]|$)/, cause: 1, effect: 2 },
    { pattern: /(.+?)(?:导致|造成|带来|使得)(.+?)(?:[。.!?]|$)/, cause: 1, effect: 2 },
    { pattern: /^because\s+(.+?)(?:,|;)\s*(.+?)(?:[.!?]|$)/i, cause: 1, effect: 2 },
    { pattern: /(.+?)\s+(?:leads?\s+to|causes?|results?\s+in|drives?|enables?)\s+(.+?)(?:[.!?]|$)/i, cause: 1, effect: 2 },
    { pattern: /(.+?)\s+because\s+(.+?)(?:[.!?]|$)/i, cause: 2, effect: 1 },
  ];
  for (const entry of patterns) {
    const match = text.match(entry.pattern);
    if (!match) continue;
    const cause = compact(match[entry.cause]);
    const effect = compact(match[entry.effect]);
    if (cause && effect) return { cause, effect };
  }
  return null;
}

function extractLeadingCause(text) {
  const patterns = [
    /^(?:因为|由于)\s*(.+?)(?:(?:，|,)(?:所以|因此|从而)|[。.!?]|$)/,
    /^because\s+(.+?)(?:(?:,|;)\s*(?!and\b|or\b|but\b)|[.!?]|$)/i,
  ];
  return firstCapture(text, patterns);
}

function firstCapture(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = compact(match?.[1]);
    if (value) return value;
  }
  return "";
}

function mergeItems(current, incoming) {
  const result = [...(current || [])];
  for (const value of incoming || []) {
    const item = compact(value);
    if (!item || result.some((existing) => similar(existing, item) >= 0.78)) continue;
    result.push(item);
  }
  return result.slice(-4);
}

function compact(value) {
  let text = normalize(value)
    .replace(/^(?:that|because|therefore|so|and|but|因为|所以|因此)[，,:：\s-]*/i, "")
    .replace(/[。.!?]+$/, "")
    .trim();
  if (!text) return "";
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  if (words.join("").length >= text.replace(/\s/g, "").length * 0.55) {
    const tokens = text.split(/\s+/);
    if (tokens.length > 18) text = `${tokens.slice(0, 18).join(" ")}…`;
  } else if ([...text].length > 34) {
    text = `${[...text].slice(0, 34).join("")}…`;
  }
  return text;
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cloneUnit(unit) {
  return {
    ...unit,
    items: [...unit.items],
    secondaryItems: [...unit.secondaryItems],
    sourceTexts: [...unit.sourceTexts],
  };
}

function similar(left, right) {
  const a = terms(left);
  const b = terms(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  a.forEach((term) => { if (b.has(term)) overlap += 1; });
  return overlap / Math.sqrt(a.size * b.size);
}

function terms(value) {
  const text = normalize(value).toLowerCase();
  const english = text.match(/[a-z][a-z'-]{2,}/g) || [];
  const chinese = [...text.replace(/[A-Za-z0-9\s，。！？；：,.!?;:'"()（）]/g, "")];
  const bigrams = chinese.slice(0, -1).map((character, index) => `${character}${chinese[index + 1]}`);
  return new Set([...english, ...bigrams]);
}

export { logicTypes };
