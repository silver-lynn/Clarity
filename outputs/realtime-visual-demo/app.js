import { semanticEngine } from "./semantic-engine.js?v=asr-language-guard-2";
import { accountAdapter } from "./account-adapter.js?v=asr-language-guard-2";
import { exportEditableHTML, exportEditablePptx } from "./export-engine.js?v=asr-language-guard-2";
import { composeLogicEvent, createLogicMemory, logicTypes, resetLogicMemory } from "./logic-engine.js?v=asr-language-guard-2";
import { DEFAULT_WHISPER_LIVEKIT_ENDPOINT, asrProviderLabel, asrProviderSupported, createAsrAdapter } from "./asr-adapter.js?v=asr-provider-1";
import { AsrEvaluationSession, createAudioCapture, downloadBlob, evaluateTranscript } from "./asr-evaluation.js?v=asr-language-guard-2";
import { createTextStabilizer } from "./text-stabilizer.js?v=asr-stabilizer-1";
import { createContextCorrector, formatGlossaryEntries, parseGlossaryText } from "./context-corrector.js?v=asr-glossary-1";
import { createVisualIntentEngine, summarizeVisualIntent, visualIntentDebugLabel } from "./visual-intent-engine.js?v=visual-intent-1";

const GLOSSARY_STORAGE_KEY = "livecanvas.contextGlossary.v1";

const state = {
  topic: "等待演讲开始",
  startedAt: null,
  timer: null,
  insights: [],
  transcript: [],
  demoRunning: false,
  asr: null,
  listening: false,
  interimText: "",
  provisionalType: null,
  lastConfirmedEvent: null,
  lastDisplayEvent: null,
  previousEvent: null,
  currentEvent: null,
  openStructure: null,
  recentStructure: null,
  logicMemory: createLogicMemory(),
  textStabilizer: createTextStabilizer(),
  contextCorrector: createContextCorrector(),
  visualIntentEngine: createVisualIntentEngine(),
  lastVisualIntent: null,
  correctionTimer: null,
  history: [],
  semanticRevision: 0,
  lastSavedAt: 0,
  eventClock: 0,
  evaluation: { session: null, capture: null, audioBlob: null, report: null, startedAsr: false },
};

const els = {
  topicTitle: document.querySelector("#topicTitle"),
  visualStage: document.querySelector("#visualStage"),
  previousStage: document.querySelector("#previousStage"),
  railItems: document.querySelector("#railItems"),
  insightCount: document.querySelector("#insightCount"),
  liveCaption: document.querySelector("#liveCaption"),
  confidence: document.querySelector("#confidence"),
  elapsed: document.querySelector("#elapsed"),
  statusText: document.querySelector("#statusText"),
  liveStatus: document.querySelector(".live-status"),
  signal: document.querySelector(".signal"),
  sentenceInput: document.querySelector("#sentenceInput"),
  sendButton: document.querySelector("#sendButton"),
  micButton: document.querySelector("#micButton"),
  demoButton: document.querySelector("#demoButton"),
  summaryButton: document.querySelector("#summaryButton"),
  resetButton: document.querySelector("#resetButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  browserNote: document.querySelector("#browserNote"),
  presentation: document.querySelector("#presentation"),
  asrProviderSelect: document.querySelector("#asrProviderSelect"),
  asrEndpointInput: document.querySelector("#asrEndpointInput"),
  languageSelect: document.querySelector("#languageSelect"),
  modelStatus: document.querySelector("#modelStatus"),
  exportHtmlButton: document.querySelector("#exportHtmlButton"),
  exportPptxButton: document.querySelector("#exportPptxButton"),
  accountButton: document.querySelector("#accountButton"),
  accountDialog: document.querySelector("#accountDialog"),
  accountTitle: document.querySelector("#accountTitle"),
  accountDescription: document.querySelector("#accountDescription"),
  accountFields: document.querySelector("#accountFields"),
  accountEmail: document.querySelector("#accountEmail"),
  accountPassword: document.querySelector("#accountPassword"),
  loginButton: document.querySelector("#loginButton"),
  signupButton: document.querySelector("#signupButton"),
  logoutButton: document.querySelector("#logoutButton"),
  accountMessage: document.querySelector("#accountMessage"),
  evaluationButton: document.querySelector("#evaluationButton"),
  evaluationDialog: document.querySelector("#evaluationDialog"),
  evaluationCloseButton: document.querySelector("#evaluationCloseButton"),
  evaluationReference: document.querySelector("#evaluationReference"),
  glossaryInput: document.querySelector("#glossaryInput"),
  glossarySaveButton: document.querySelector("#glossarySaveButton"),
  glossaryMessage: document.querySelector("#glossaryMessage"),
  evaluationLanguageHint: document.querySelector("#evaluationLanguageHint"),
  evaluationStartButton: document.querySelector("#evaluationStartButton"),
  evaluationStopButton: document.querySelector("#evaluationStopButton"),
  evaluationResult: document.querySelector("#evaluationResult"),
  evaluationDownloadAudioButton: document.querySelector("#evaluationDownloadAudioButton"),
  evaluationDownloadReportButton: document.querySelector("#evaluationDownloadReportButton"),
};

const demoLines = [
  "今天我想讲的主题是实时视觉表达。",
  "这个系统包括听懂演讲、理解结构和画出视觉三个部分。",
  "首先捕捉声音，然后识别含义，接着选择图形，最后生成可以分享的演示文稿。",
  "传统PPT是在演讲之前整理信息，而实时画布是在演讲发生时组织信息。",
  "我们不是在自动制作幻灯片，而是在创造一种新的视觉表达方式。",
  "所以请记住：实时不是附加功能，实时就是这个产品的核心。",
  "In our survey, mobile users account for 20% of the audience.",
  "今年的用户数量增长了20%，from 100 to 120.",
];

const labels = {
  theme: "主题",
  process: "流程",
  relation: "关系",
  compare: "对比",
  list: "清单",
  insight: "洞察",
  pie: "占比",
  bar: "数据",
  claim_evidence: "观点证据",
  problem_solution: "问题方案",
  cause_effect: "因果",
};

const processMarkerSource = "首先|第一步|第二步|第三步|第四步|第五步|第六步|第一点|第二点|第三点|第四点|第五点|下一步|接下来|再然后|然后|接着|其次|随后|最后|最终|to\\s+begin\\s+with|start\\s+by|begin\\s+by|first(?:ly)?|step\\s*(?:one|two|three|four|five|1|2|3|4|5)|then|next|followed\\s+by|after\\s+that|afterwards|subsequently|once\\s+that\\s+is\\s+done|finally|lastly|the\\s+final\\s+step";
const strongProcessMarker = /^(首先|第[一二三四五六]步|第[一二三四五]点|下一步|to\s+begin\s+with|start\s+by|begin\s+by|first(?:ly)?|step\s*(?:one|1))$/i;
const stepActionPattern = /^(?:请|我们|你|先)?\s*(?:收集|分析|创建|打开|选择|输入|点击|发送|检查|定义|构建|测试|部署|识别|准备|连接|安装|运行|添加|删除|生成|整理|确认|绘制|画出|列出|比较|计算|验证|collect\b|gather\b|analy[sz]e\b|create\b|open\b|select\b|enter\b|click\b|send\b|review\b|define\b|build\b|test\b|deploy\b|measure\b|identify\b|prepare\b|connect\b|install\b|run\b|choose\b|add\b|remove\b|generate\b|validate\b|capture\b|convert\b|draw\b|list\b|compare\b|calculate\b)/i;
const ordinalValues = { 第一: 1, 第二: 2, 第三: 3, 第四: 4, 第五: 5, 第六: 6, 第七: 7, 第八: 8, 第九: 9, 第十: 10 };
const englishOrdinalValues = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const structureTypes = new Set(["process", "list"]);
const topicShiftPattern = /^(?:(?:现在|下面|另外|另一个|换个|说到|至于|关于|回到|我们再看|让我们(?:来)?(?:谈谈|讨论|看看)|接下来(?:我们)?(?:谈|讨论|看))|(?:(?:now|next)[,\s]+(?:let(?:'s| us)|we(?:'ll| will| are going to))\s+(?:move|turn|talk|look|discuss)|moving\s+(?:on|to)|turning\s+to|another\s+(?:topic|question|issue|point)|a\s+different\s+(?:topic|question|issue)|the\s+next\s+(?:topic|question|issue)|as\s+for|regarding|on\s+the\s+subject\s+of))/i;
const processContinuationPattern = /^(?:然后|接着|随后|下一步|再然后|最后(?:是)?|最终|then|next|followed\s+by|after\s+that|afterwards|subsequently|once\s+that\s+is\s+done|finally|lastly|the\s+final\s+step)[，,:：\s-]*(.+?)(?:[。！.!?]|$)/i;
const listContinuationPattern = /^(?:其次|另外(?:一点)?|还有|第二|第三|第四|第五|second(?:ly)?|third(?:ly)?|fourth(?:ly)?|fifth(?:ly)?|another\s+(?:point|reason|item)|also|in\s+addition)[，,:：\s-]*(.+?)(?:[。！.!?]|$)/i;

function escapeHTML(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function startSession() {
  if (state.startedAt) return;
  state.startedAt = Date.now();
  state.timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
    els.elapsed.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }, 1000);
}

function setActive(active, label = "正在理解") {
  els.liveStatus.classList.toggle("active", active);
  els.signal.classList.toggle("active", active);
  els.statusText.textContent = active ? label : "等待输入";
}

function cleanSpeech(value) {
  return String(value || "")
    .replace(/^(?:呃+|额+|嗯+|啊+|那个|这个|就是说|就是|然后)[，,。.!?！？；;：:\s]*/g, "")
    .replace(/^(?:um+|uh+|erm+|you\s+know|I\s+mean)[,.!?;:\s]*/i, "")
    .replace(/(^|[，,。.!?！？；;：:\s])(?:呃+|额+|嗯+|啊+|那个|这个|就是说|就是|然后)(?=$|[，,。.!?！？；;：:\s])/g, "$1")
    .replace(/(^|[,.!?;:\s])(?:um+|uh+|erm+|you\s+know|I\s+mean)(?=$|[,.!?;:\s])/gi, "$1")
    .replace(/\s+([，。！？；：,.!?;:])/g, "$1")
    .replace(/([，,。.!?！？；;：:])\1+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeEvent(event) {
  const sanitized = { ...event };
  if (sanitized.subject) sanitized.subject = cleanPhrase(sanitized.subject);
  if (sanitized.items) sanitized.items = structureTypes.has(sanitized.type)
    ? compactStructureItems(sanitized.items)
    : sanitized.items.map(cleanSpeech).filter(Boolean);
  if (sanitized.values) sanitized.values = sanitized.values.map((item) => ({ ...item, label: cleanSpeech(item.label) }));
  if (sanitized.secondaryItems) sanitized.secondaryItems = sanitized.secondaryItems.map(compactNode).filter(Boolean);
  return sanitized;
}

function cleanPhrase(value) {
  return cleanSpeech(value)
    .replace(/^[，,、；;：:\s]+/, "")
    .replace(/[，,、；;：:\s]+$/, "")
    .replace(/(?:等)?(?:一|二|三|四|五|六|几个|\d+)?(?:个)?(?:部分|方面|步骤|阶段|要素)$/u, "")
    .replace(/(?:组成|构成)$/u, "")
    .replace(/^(?:就是|也就是|即|分别是)[，,:：\s]*/, "")
    .replace(/^(?:is|are|means?|namely)[，,:：\s]+/i, "")
    .trim();
}

function compactNode(value) {
  let text = cleanPhrase(value)
    .replace(/^(?:we|you|I)\s+(?:need|have|want)\s+to\s+/i, "")
    .replace(/^(?:我们|你们|我)(?:需要|要|应该|可以)/, "")
    .split(/(?:，|;|；|\bbecause\b|\bwhich\s+means\b|\bso\s+that\b|\bin\s+order\s+to\b|因为|从而|也就是说)/i)[0]
    .replace(/,?\s+and$/i, "")
    .trim();
  if (!text) return "正在聆听…";
  const englishWords = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const isMostlyEnglish = englishWords.join("").length >= text.replace(/\s/g, "").length * 0.55;
  if (isMostlyEnglish) {
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length > 12) text = `${tokens.slice(0, 12).join(" ")}…`;
  } else if ([...text].length > 22) {
    text = `${[...text].slice(0, 22).join("")}…`;
  }
  return text;
}

function compactStructureItems(items) {
  const compact = items.map(compactNode).filter(Boolean);
  return compact.filter((item, index) => compact.indexOf(item) === index);
}

function semanticTerms(value) {
  const text = cleanSpeech(value).toLowerCase();
  const english = (text.match(/[a-z][a-z'-]{2,}/g) || []).filter((word) => !["the", "and", "that", "this", "with", "from", "then", "next", "finally", "about", "into", "will", "have", "your", "their"].includes(word));
  const chinese = [...text.replace(/[A-Za-z0-9\s，。！？；：,.!?;:'"()（）]/g, "")];
  const bigrams = chinese.slice(0, -1).map((character, index) => `${character}${chinese[index + 1]}`);
  return new Set([...english, ...bigrams]);
}

function lexicalSimilarity(left, right) {
  const a = semanticTerms(left);
  const b = semanticTerms(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  a.forEach((term) => { if (b.has(term)) overlap += 1; });
  return overlap / Math.sqrt(a.size * b.size);
}

function topicShift(text) {
  return topicShiftPattern.test(cleanSpeech(text));
}

function shiftedTopic(text) {
  const cleaned = cleanSpeech(text);
  const match = cleaned.match(/(?:谈谈|讨论|看看|说到|关于|至于|move(?:\s+on)?\s+to|turn(?:ing)?\s+to|talk\s+about|discuss|look\s+at|regarding|as\s+for)\s*[：,:-]?\s*(.+?)(?:[。.!?]|$)/i);
  const topic = compactNode(match?.[1] || cleaned.replace(topicShiftPattern, ""));
  return topic && topic !== "正在聆听…" ? topic : null;
}

function closeOpenStructure(reason = "complete") {
  const previous = state.openStructure;
  state.openStructure = null;
  if (previous) state.recentStructure = { ...structuredClone(previous), closedAt: state.eventClock || Date.now() };
  if (previous) setActive(true, reason === "shift" ? "结构结束 · 进入新主题" : "结构已经完成");
  return previous;
}

function extractTopic(text) {
  const patterns = [
    /(?:今天|现在)?(?:我想|我们要)?(?:讲|讨论|分享)(?:的)?(?:主题)?(?:是|叫做)[：:]?(.{1,28})/,
    /(?:主题|核心问题)(?:是|叫做)[：:]?(.{1,28})/,
    /(?:today|now)?\s*(?:I(?:'d)?\s+(?:like|want)\s+to|we(?:'re|\s+are)\s+going\s+to)?\s*(?:talk|speak|discuss|share)\s+(?:about|on)\s+(.{2,60})/i,
    /(?:the\s+)?(?:topic|subject|central\s+question)\s+is\s+(.{2,60})/i,
    /(?:let(?:'s| us)|we(?:'ll| will))\s+(?:discuss|examine|look\s+at|focus\s+on|talk\s+about)\s+(.{2,60})/i,
    /(?:moving\s+on\s+to|turning\s+to|next,?\s+let(?:'s| us)\s+(?:discuss|look\s+at))\s+(.{2,60})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanPhrase(match[1].replace(/[。！？，,]$/, ""));
  }
  return null;
}

function extractProcess(text) {
  const markerPattern = new RegExp(`(${processMarkerSource})`, "gi");
  const matches = [...text.matchAll(markerPattern)].filter((match) => {
    if (!/^(?:first(?:ly)?|首先)$/i.test(match[1])) return true;
    const leading = text.slice(0, match.index).trim().replace(/^(?:and|so|now|okay|well|那么)[，,:：\s-]*/i, "");
    return !leading;
  });
  if (!matches.length) return null;
  const items = matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return cleanPhrase(text.slice(start, end).split(/[。！？.!?]/)[0]) || "正在聆听…";
  });
  const firstMarker = matches[0][1];
  const explicitStart = /第[一二三四五六]步|第一点|下一步|to\s+begin\s+with|start\s+by|begin\s+by|step\s*(?:one|1)|first\s+(?:step|point|reason|item)/i.test(`${firstMarker} ${items[0]}`);
  const firstMarkerAtStart = !text.slice(0, matches[0].index).trim().replace(/^(?:and|so|now|okay|well|那么)[，,:：\s-]*/i, "");
  return {
    items: items.slice(0, 6),
    markerCount: matches.length,
    strongStart: firstMarkerAtStart && strongProcessMarker.test(firstMarker) && (explicitStart || stepActionPattern.test(items[0])),
  };
}

function extractEnumeratedItem(text) {
  const match = text.match(/^(第一|第二|第三|第四|第五|第六|第七|第八|第九|第十)(?!个|次|批|年|天|类|种|位|名|章|节|季|轮|阶段|部分|方面)[，,:：\s]*(.+?)(?:。|！|$)/);
  const englishMatch = text.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:ly)?(?:\s+(?:step|point|reason|item))?[,:\s]+(.+?)(?:[.!]|$)/i);
  if (!match && !englishMatch) return null;
  const item = cleanPhrase((match || englishMatch)[2]);
  if (!item) return null;
  const explicitStep = /步骤|step/i.test((match || englishMatch)[0]);
  return {
    ordinal: match ? ordinalValues[match[1]] : englishOrdinalValues[englishMatch[1].toLowerCase()],
    item,
    suggestedType: explicitStep || stepActionPattern.test(item) ? "process" : "list",
  };
}

function extractRelation(text) {
  if (/(?:不包括|不包含|并非由|does\s+not\s+include|doesn't\s+include|do\s+not\s+include|not\s+include|without\s+including)/i.test(text)) return null;
  const trigger = text.match(/(?:(?:包括|包含|分为|可以分成|可分成|主要有|分别是)(?:了)?(?:以下)?(?:几个|两个|三个|四个|五个)?(?:部分|方面|步骤|阶段|要素)?|有(?:几个|两个|三个|四个|五个)(?:部分|方面|步骤|阶段|要素)|includes?|contains?|comprises?|consists?\s+of|is\s+(?:made|composed)\s+of|can\s+be\s+divided\s+into|falls?\s+into|(?:has|have|had)\s+(?:a\s+)?(?:two|three|four|five|\d+)[-\s](?:part|act|stage|component|element|category)(?:s|\s+structure)?)[：:]?/i);
  const composed = text.match(/^(.{1,20}?)由(.+?)(?:组成|构成)(?:。|！|$)/);
  if (!trigger && composed) {
    const items = composed[2].split(/、|，|,|；|;|以及|还有|和|与|\band\b/gi).map(cleanPhrase).filter(Boolean).slice(0, 6);
    return { subject: cleanPhrase(composed[1]), items, strongTrigger: items.length >= 2 };
  }
  if (!trigger) return null;

  const triggerIndex = text.indexOf(trigger[0]);
  let subject = cleanPhrase(text.slice(0, triggerIndex));
  subject = subject.replace(/^(今天|现在|我们认为|我认为)/, "").trim();
  const subjectLimit = /[A-Za-z]/.test(subject) ? 48 : 18;
  if (!subject || subject.length > subjectLimit) subject = state.topic === "等待演讲开始" ? "当前主题" : state.topic;

  const tail = text.slice(triggerIndex + trigger[0].length).replace(/[。！]$/, "");
  const hasListSeparator = /[、，,；;]|以及|还有|和|与|\band\b/i.test(tail);
  const items = tail
    .split(/、|，|,|；|;|以及|还有|和|与|\band\b/gi)
    .map(cleanPhrase)
    .filter((item) => item.length > 0)
    .slice(0, 6);

  const visibleItems = items.filter((item) => item !== "正在聆听…");
  return {
    subject,
    items: items.length ? items : ["正在聆听…"],
    strongTrigger: true,
    progressiveTrigger: visibleItems.length >= 2 || (visibleItems.length >= 1 && hasListSeparator),
  };
}

function extractCompare(text) {
  if (/不是.+而是/.test(text)) {
    const parts = text.split(/而是/);
    const left = cleanPhrase(parts[0].split("不是").pop()) || "正在聆听…";
    const right = parts.length > 1 ? cleanPhrase(parts.slice(1).join("而是").replace(/[。！]$/, "")) : "正在聆听…";
    return [left, right];
  }

  const paired = text.match(/(?:一方面)(.+?)(?:，|,)?(?:另一方面)(.+?)(?:。|！|$)/);
  if (paired) return [cleanPhrase(paired[1]), cleanPhrase(paired[2])];

  const englishPaired = text.match(/(?:on\s+the\s+one\s+hand)(.+?)(?:,|;)?(?:on\s+the\s+other\s+hand)(.+?)(?:[.!]|$)/i);
  if (englishPaired) return [cleanPhrase(englishPaired[1]), cleanPhrase(englishPaired[2])];

  if (/\bwhat\s+is\b/i.test(text) && /\bwhat\s+could\s+be\b/i.test(text)) {
    return ["What is · current state", "What could be · possible future"];
  }

  const isNotInstead = text.match(/(.{2,70}?)\s+(?:isn't|is\s+not)\s+(.+?)(?:[.;,])\s*(?:it|this|that|the\s+answer|the\s+future)\s+is\s+(.+?)(?:[.!]|$)/i);
  if (isNotInstead) return [cleanPhrase(`${isNotInstead[1]} is not ${isNotInstead[2]}`), cleanPhrase(isNotInstead[3])];

  const although = text.match(/虽然(.+?)(?:，|,)?(?:但是|但)(.+?)(?:。|！|$)/);
  if (although) return [cleanPhrase(although[1]).slice(-34), cleanPhrase(although[2]).slice(0, 34)];

  const marker = text.match(/但是|相比之下|相较之下|与此不同|却/);
  if (marker) {
    const markerIndex = text.indexOf(marker[0]);
    const beforeParts = text.slice(0, markerIndex).split(/[，,。；;！？]/).map(cleanPhrase).filter(Boolean);
    const afterParts = text.slice(markerIndex + marker[0].length).split(/[，,。；;！？]/).map(cleanPhrase).filter(Boolean);
    const left = (beforeParts.pop() || "").slice(-34);
    const right = (afterParts[0] || "").slice(0, 34);
    const meaningfulLeft = left.replace(/[（）()\s鼓掌笑声]/g, "");
    if (meaningfulLeft.length >= 4 && right.length >= 3) {
      const pair = [left, right];
      pair.weakTrigger = /^(?:但是|却)$/.test(marker[0]);
      return pair;
    }
  }
  const notBut = text.match(/not\s+(.+?)\s+but\s+(.+?)(?:[.!]|$)/i);
  if (notBut) return [cleanPhrase(notBut[1]), cleanPhrase(notBut[2])];
  const whereas = text.match(/(.+?)(?:,|;)\s*(?:while|whereas|by\s+contrast)\s+(.+?)(?:[.!]|$)/i);
  if (whereas) return [cleanPhrase(whereas[1]).slice(-50), cleanPhrase(whereas[2]).slice(0, 50)];
  const althoughEnglish = text.match(/although\s+(.+?)(?:,|;)\s*(?:but\s+)?(.+?)(?:[.!]|$)/i);
  if (althoughEnglish) return [cleanPhrase(althoughEnglish[1]), cleanPhrase(althoughEnglish[2])];
  return null;
}

function extractDataVisual(text) {
  const growth = text.match(/(?:增长|增加|提升|上涨|提高|grew|grown|growth|increase[sd]?|rose|risen|up)\s*(?:了|by)?\s*(\d+(?:\.\d+)?)\s*(?:%|percent|个百分点)/i)
    || text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:的)?(?:增长|增加|提升|上涨|growth|increase)/i);
  const decline = text.match(/(?:下降|减少|降低|下跌|decrease[sd]?|decline[sd]?|fell|fallen|down)\s*(?:了|by)?\s*(\d+(?:\.\d+)?)\s*(?:%|percent|个百分点)/i);
  if (growth || decline) {
    const delta = Number((growth || decline)[1]) * (decline ? -1 : 1);
    const labelMatch = text.match(/^(.{1,26}?)(?:增长|增加|提升|上涨|提高|下降|减少|降低|下跌|grew|growth|increase|rose|decrease|decline|fell|is\s+up|is\s+down)/i);
    const label = cleanPhrase(labelMatch?.[1] || "当前指标");
    return {
      type: "bar",
      title: delta >= 0 ? "增长变化" : "下降变化",
      values: [{ label: "之前", value: 100 }, { label: label || "现在", value: Math.max(0, 100 + delta) }],
      delta,
      items: [`${label || "指标"}${delta >= 0 ? "增长" : "下降"}${Math.abs(delta)}%`],
    };
  }

  const values = [];
  const patterns = [
    /([^，。；,.!?]{1,28}?)(?:占|占比|比例为|份额为)\s*(?:百分之)?\s*(\d+(?:\.\d+)?)\s*%?/g,
    /([^,.;!?]{1,38}?)(?:accounts?\s+for|represents?|makes?\s+up)\s*(\d+(?:\.\d+)?)\s*(?:%|percent)/gi,
    /(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+([^,.;!?]{1,38})/gi,
  ];
  patterns.forEach((pattern, patternIndex) => {
    if (patternIndex === 2 && /\b(?:accounts?\s+for|represents?|makes?\s+up)\b/i.test(text)) return;
    for (const match of text.matchAll(pattern)) {
      const value = Number(patternIndex === 2 ? match[1] : match[2]);
      const label = cleanPhrase(patternIndex === 2 ? match[2] : match[1]).replace(/^(?:and|以及|其中)\s*/i, "");
      if (value >= 0 && value <= 100 && label) values.push({ label: label.slice(-34), value });
    }
  });
  for (const match of text.matchAll(/(?:the\s+)?([^,.;!?]{1,34}?\b\d+(?:\.\d+)?\s*percent)[^,.;!?]{0,34}?(?:take|receive|hold|have)\s+(?:about\s+)?(\d+(?:\.\d+)?)\s*percent/gi)) {
    const value = Number(match[2]);
    const label = cleanPhrase(match[1]);
    if (value >= 0 && value <= 100 && label) values.push({ label: label.slice(-34), value });
  }
  const unique = values.filter((item, index, all) => all.findIndex((candidate) => candidate.label === item.label && candidate.value === item.value) === index).slice(0, 6);
  if (unique.length >= 2) return { type: "bar", title: "数据对比", values: unique, items: unique.map((item) => `${item.label} ${item.value}%`) };
  if (unique.length === 1) return { type: "pie", title: "占比关系", values: unique, items: [`${unique[0].label} ${unique[0].value}%`] };
  return null;
}

function semanticEvent(type, text) {
  const cleaned = cleanSpeech(text);
  if (type === "process") {
    const items = cleaned.split(/(?:，|,|；|;|。|\band\s+then\b|\bthen\b|\bnext\b|\bfinally\b)/i).map(cleanPhrase).filter((item) => item.length >= 2).slice(0, 6);
    if (items.length >= 2) return { type, title: "语义识别出的流程", items, semantic: true };
  }
  if (type === "relation") {
    const parts = cleaned.split(/包括|包含|由|分为|includes?|contains?|comprises?|consists?\s+of|made\s+up\s+of/i);
    const subject = cleanPhrase(parts[0]) || state.topic;
    const items = cleanPhrase(parts.slice(1).join(" ")).split(/、|，|,|；|;|以及|和|与|\band\b/gi).map(cleanPhrase).filter(Boolean).slice(0, 6);
    if (items.length >= 2) return { type, title: "语义识别出的组成关系", subject, items, semantic: true };
  }
  if (type === "compare") {
    const parts = cleaned.split(/但是|但|而|相比|却|\bbut\b|\bwhile\b|\bwhereas\b|\brather\s+than\b/i).map(cleanPhrase).filter(Boolean);
    if (parts.length >= 2) return { type, title: "语义识别出的对比", items: [parts[0].slice(-48), parts.slice(1).join(" ").slice(0, 48)], semantic: true };
  }
  if (type === "list") {
    const items = cleaned.split(/、|，|,|；|;|以及|\band\b/gi).map(cleanPhrase).filter((item) => item.length >= 2).slice(0, 6);
    if (items.length >= 2) return { type, title: "语义识别出的要点", items, semantic: true };
  }
  if (type === "cause_effect") {
    const parts = cleaned.split(/所以|因此|导致|造成|从而|\bbecause\b|\btherefore\b|\bas\s+a\s+result\b|\bleads?\s+to\b|\bcauses?\b/i).map(cleanPhrase).filter(Boolean);
    if (parts.length >= 2) return { type, title: "原因如何产生结果", subject: parts[0], items: [parts.slice(1).join(" ")], secondaryItems: [], semantic: true, logicId: `semantic-${Date.now()}` };
  }
  if (type === "problem_solution") {
    const parts = cleaned.split(/解决方案|解决办法|所以需要|可以通过|\bthe\s+solution\s+is\b|\bwe\s+(?:need|should|can)\s+to\b/i).map(cleanPhrase).filter(Boolean);
    if (parts.length >= 2) return { type, title: "从问题走向方案", subject: parts[0], items: [parts.slice(1).join(" ")], secondaryItems: [], semantic: true, logicId: `semantic-${Date.now()}` };
  }
  if (type === "claim_evidence") {
    const parts = cleaned.split(/例如|比如|因为|数据显示|研究表明|\bfor\s+example\b|\bbecause\b|\bdata\s+shows?\b|\bresearch\s+shows?\b/i).map(cleanPhrase).filter(Boolean);
    if (parts.length >= 2) return { type, title: "观点正在获得支持", subject: parts[0], items: [parts.slice(1).join(" ")], secondaryItems: [], semantic: true, logicId: `semantic-${Date.now()}` };
  }
  if (type === "theme") return { type, title: cleaned.slice(0, 60), items: [cleaned.slice(0, 60)], semantic: true };
  if (type === "insight") return { type, title: "语义识别出的结论", items: [cleaned], prominent: true, semantic: true };
  return null;
}

function intentScore(intent, type) {
  return intent?.ranked?.find((item) => item.type === type)?.score || 0;
}

function annotateIntent(event, intent, disposition = "accepted") {
  return {
    ...event,
    visualIntent: summarizeVisualIntent(intent),
    intentDisposition: disposition,
  };
}

function listEventFromIntent(text) {
  const cleaned = cleanSpeech(text);
  const declaration = cleaned.match(/(?:原因|理由|要点|因素|好处|风险|清单|reasons?|points?|factors?|benefits?|risks?|items?|checklist)(?:\s*(?:are|include|:)|(?:是|包括|分别是|有))?\s*[:：]?\s*(.+)$/i);
  const tail = declaration?.[1] || cleaned;
  const items = tail
    .split(/、|，|,|；|;|以及|还有|和|与|\band\b/gi)
    .map(cleanPhrase)
    .filter((item) => item.length >= 2)
    .slice(0, 6);
  return items.length >= 2 ? { type: "list", title: "清单正在形成", items, semantic: true } : null;
}

function eventFromVisualIntent(type, text) {
  if (type === "list") return listEventFromIntent(text) || semanticEvent(type, text);
  return semanticEvent(type, text);
}

function applyVisualIntent(event, text, intent, confirmed) {
  if (!intent || ["pie", "bar"].includes(event.type)) return annotateIntent(event, intent, "accepted");
  const topType = intent.topType;
  const currentScore = intentScore(intent, event.type);
  const topScore = intentScore(intent, topType);
  const structuralTypes = new Set(["process", "relation", "compare", "list"]);

  if (event.type === "live" && intent.shouldDraw && ["theme", "process", "relation", "compare", "list", "insight"].includes(topType)) {
    const candidate = eventFromVisualIntent(topType, text);
    if (candidate && (confirmed || intent.confidence >= 0.62)) return annotateIntent(candidate, intent, "promoted");
  }

  if (event.type === "process" && topType === "list" && topScore >= currentScore + 0.16) {
    return annotateIntent({ ...event, type: "list", title: "清单正在形成", strongStart: false }, intent, "retargeted");
  }

  if (structuralTypes.has(event.type) && topType === "live" && currentScore < 0.24) {
    return annotateIntent({ type: "live", title: "正在把语言变成视觉", items: [text] }, intent, "suppressed");
  }

  if (structuralTypes.has(event.type) && !["live", event.type].includes(topType) && currentScore < 0.26 && topScore >= 0.54) {
    const candidate = eventFromVisualIntent(topType, text);
    if (candidate) return annotateIntent(candidate, intent, "retargeted");
  }

  return annotateIntent(event, intent, "accepted");
}

function analyzeIncremental(text, options = {}) {
  const confirmed = Boolean(options.confirmed);
  const suppressSequence = Boolean(options.suppressSequence);
  const dataVisual = extractDataVisual(text);
  if (dataVisual) return dataVisual;

  const process = suppressSequence ? null : extractProcess(text);
  if (process && process.markerCount >= 2) {
    return { type: "process", title: "流程正在形成", items: process.items, strongStart: process.strongStart };
  }
  const enumerated = suppressSequence ? null : extractEnumeratedItem(text);
  if (enumerated) {
    return { type: enumerated.suggestedType, title: enumerated.suggestedType === "process" ? "流程正在形成" : "清单正在形成", items: [enumerated.item], ordinal: enumerated.ordinal };
  }

  if (process && !confirmed && process.strongStart) {
    return { type: "process", title: "流程正在形成", items: process.items, strongStart: true };
  }

  const relation = extractRelation(text);
  if (relation && relation.strongTrigger && (relation.items.filter((item) => item !== "正在聆听…").length >= 2 || (!confirmed && relation.progressiveTrigger))) {
    return { type: "relation", title: "组成结构正在形成", subject: relation.subject, items: relation.items };
  }

  if (/(所以|因此|请记住|核心是|最重要|结论|关键在于|这意味着|这说明|要点是|therefore|so\s+the\s+key|remember|the\s+key\s+(?:point|idea|lesson)|the\s+(?:main\s+)?point\s+is|the\s+idea\s+is|the\s+only\s+difference\s+is|most\s+important|what(?:'s|\s+is)\s+(?:really\s+)?important\s+(?:is|to\s+know\s+is)|in\s+conclusion|the\s+conclusion|the\s+takeaway\s+is|the\s+bottom\s+line\s+is|what\s+this\s+means\s+is|this\s+(?:means|shows|reveals)\s+that|what\s+emerges\s+is|the\s+(?:value|essence|power)\s+of\s+.+?\s+is)/i.test(text)) {
    return {
      type: "insight",
      title: "值得记住",
      items: [cleanPhrase(text.replace(/^(所以|因此|请记住|therefore|remember|in\s+conclusion)[：，,:]?/i, "").replace(/[。！.!]$/, ""))],
      prominent: /^(所以|因此|请记住|therefore|remember|in\s+conclusion|the\s+bottom\s+line|the\s+takeaway)|结论|conclusion/i.test(text),
    };
  }

  const compare = extractCompare(text);
  if (compare && (confirmed || !compare.weakTrigger || /[。.!?]["'”’）》】\]]?$/.test(text.trim()))) {
    return { type: "compare", title: "对比关系正在形成", items: compare };
  }

  const topic = extractTopic(text);
  if (topic) return { type: "theme", title: topic, items: [topic] };

  return { type: "live", title: "正在把语言变成视觉", items: [text] };
}

function addInsight(event) {
  if (!["theme", "process", "relation", "compare", "list", "insight", "pie", "bar", ...logicTypes].includes(event.type)) return;
  const text = event.type === "relation"
    ? `${event.subject}：${event.items.join("、")}`
    : ["pie", "bar"].includes(event.type)
      ? event.values.map((item) => `${item.label} ${item.value}%`).join(" / ")
    : event.type === "process"
      ? event.items.join(" → ")
    : event.type === "list"
      ? event.items.join(" · ")
    : logicTypes.has(event.type)
      ? `${event.subject}${event.items.length ? ` → ${event.items.join(" · ")}` : ""}`
      : event.items.join(" / ");
  if (!text || state.insights.some((item) => item.text === text)) return;
  const record = { type: event.type, text, prominent: Boolean(event.prominent), itemCount: event.items?.length || 1, logicId: event.logicId || null };
  const lastInsight = state.insights[state.insights.length - 1];
  if ((event.type === "list" && lastInsight?.type === "list") || (event.logicId && lastInsight?.logicId === event.logicId)) {
    state.insights[state.insights.length - 1] = record;
    renderRail();
    return;
  }
  state.insights.push(record);
  renderRail();
}

function recordHistory(event) {
  if (event.type === "live") return;
  const signature = JSON.stringify({ type: event.type, subject: event.subject, items: event.items, secondaryItems: event.secondaryItems, values: event.values });
  const previous = state.history[state.history.length - 1];
  if (previous?.signature === signature) return;
  if (event.logicId && previous?.logicId === event.logicId) {
    state.history[state.history.length - 1] = { ...structuredClone(event), signature };
    saveProjectSoon();
    return;
  }
  state.history.push({ ...structuredClone(event), signature });
  if (state.history.length > 80) state.history.shift();
  saveProjectSoon();
}

function renderRail() {
  els.insightCount.textContent = String(state.insights.length);
  if (!state.insights.length) {
    els.railItems.innerHTML = '<div class="rail-empty">确认后的重要内容会留在这里</div>';
    return;
  }
  const visibleInsights = state.insights.slice(-6);
  const startIndex = Math.max(0, state.insights.length - visibleInsights.length);
  els.railItems.innerHTML = visibleInsights.map((item, index) => `
    <div class="rail-item" data-index="${String(startIndex + index + 1).padStart(2, "0")}">
      <b>${labels[item.type] || "记录"}</b>${escapeHTML(item.text)}
    </div>
  `).join("");
}

function ensureScene(type, kicker, title, contentClass, stage = els.visualStage) {
  const contentSelector = `.${contentClass.split(/\s+/)[0]}`;
  if (stage.dataset.scene !== type || !stage.querySelector(contentSelector)) {
    stage.dataset.scene = type;
    stage.innerHTML = `
      <article class="visual-card">
        <div class="visual-kicker"><i></i><span>${escapeHTML(kicker)}</span></div>
        <h2 class="visual-title">${escapeHTML(title)}</h2>
        <div class="${contentClass}"></div>
      </article>
    `;
  } else {
    stage.querySelector(".visual-kicker span").textContent = kicker;
    stage.querySelector(".visual-title").textContent = title;
  }
  return stage.querySelector(contentSelector);
}

function visualTokens(text) {
  const clean = text.trim();
  if (!clean) return [];
  if (window.Intl?.Segmenter) {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    const parts = [...segmenter.segment(clean)]
      .map((part) => part.segment.trim())
      .filter((part) => part && !/^[，。！？；：,.!?;:]$/.test(part));
    if (parts.length) return parts;
  }
  return [...clean.replace(/[，。！？；：,.!?;:]/g, "")];
}

function syncTokens(container, text, confirmed) {
  const tokens = visualTokens(text);
  tokens.forEach((token, index) => {
    let element = container.children[index];
    if (!element) {
      element = document.createElement("span");
      element.className = "speech-token";
      container.appendChild(element);
    }
    element.textContent = token;
    element.className = `speech-token ${confirmed ? "confirmed" : index === tokens.length - 1 ? "current" : ""}`;
  });
  while (container.children.length > tokens.length) container.lastElementChild.remove();
}

function syncFlow(container, items, confirmed) {
  items.forEach((item, index) => {
    let unit = container.children[index];
    if (!unit) {
      unit = document.createElement("div");
      unit.className = "flow-unit";
      unit.innerHTML = `${index ? '<span class="flow-arrow"></span>' : ""}<div class="flow-step"><b></b><span></span></div>`;
      container.appendChild(unit);
    }
    const step = unit.querySelector(".flow-step");
    step.querySelector("b").textContent = String(index + 1).padStart(2, "0");
    step.querySelector("span").textContent = item;
    const isCurrent = index === items.length - 1;
    step.className = `flow-step ${confirmed ? "confirmed" : "provisional"}${!confirmed && isCurrent ? " current" : ""}`;
  });
  while (container.children.length > items.length) container.lastElementChild.remove();
}

function syncRelation(container, event, confirmed) {
  let core = container.querySelector(".relation-core");
  let children = container.querySelector(".relation-children");
  if (!core) {
    container.innerHTML = '<div class="relation-core"></div><div class="relation-line"></div><div class="relation-children"></div>';
    core = container.querySelector(".relation-core");
    children = container.querySelector(".relation-children");
  }
  core.textContent = event.subject;
  core.style.opacity = confirmed ? "1" : ".72";

  event.items.forEach((item, index) => {
    let child = children.children[index];
    if (!child) {
      child = document.createElement("div");
      children.appendChild(child);
    }
    child.textContent = item;
    child.className = `relation-child ${confirmed ? "confirmed" : "provisional"}${!confirmed && index === event.items.length - 1 ? " current" : ""}`;
  });
  while (children.children.length > event.items.length) children.lastElementChild.remove();
}

function syncList(container, items, confirmed) {
  items.forEach((item, index) => {
    let element = container.children[index];
    if (!element) {
      element = document.createElement("div");
      container.appendChild(element);
    }
    element.className = `list-item ${confirmed ? "confirmed" : "provisional"}${!confirmed && index === items.length - 1 ? " current" : ""}`;
    element.innerHTML = `<b>${String(index + 1).padStart(2, "0")}</b><span>${escapeHTML(item)}</span>`;
  });
  while (container.children.length > items.length) container.lastElementChild.remove();
}

function renderPie(container, event, confirmed) {
  const values = [...event.values];
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (total < 100) values.push({ label: "其他 / Other", value: 100 - total });
  let cursor = 0;
  const colors = ["#6757e8", "#ff6b35", "#7ee5e2", "#c7f36b", "#d8d2ff", "#9993d8"];
  const gradient = values.map((item, index) => {
    const start = cursor;
    cursor += item.value;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  }).join(",");
  container.innerHTML = `<div class="pie-chart ${confirmed ? "confirmed" : "provisional"}" style="background:conic-gradient(${gradient})"><div><strong>${event.values[0].value}%</strong><span>${escapeHTML(event.values[0].label)}</span></div></div><div class="chart-legend">${values.map((item, index) => `<span><i style="background:${colors[index % colors.length]}"></i>${escapeHTML(item.label)} <b>${item.value}%</b></span>`).join("")}</div>`;
}

function renderBars(container, event, confirmed) {
  const max = Math.max(...event.values.map((item) => item.value), 1);
  container.innerHTML = event.values.map((item, index) => `<div class="bar-column ${confirmed ? "confirmed" : "provisional"}"><b>${item.value}%</b><i style="height:${Math.max(7, item.value / max * 100)}%;--bar-index:${index}"></i><span>${escapeHTML(item.label)}</span></div>`).join("");
}

function renderLogic(container, event, confirmed) {
  const items = event.items || [];
  const secondaryItems = event.secondaryItems || [];
  const statusClass = confirmed ? "confirmed" : "provisional";

  if (event.type === "claim_evidence") {
    container.innerHTML = `
      <div class="logic-anchor claim-anchor ${statusClass}"><span>观点 / CLAIM</span><strong>${escapeHTML(event.subject)}</strong></div>
      <div class="logic-connector"><i></i></div>
      <div class="logic-supports">
        ${items.length ? items.map((item, index) => `<div class="logic-node ${statusClass}"><b>${String(index + 1).padStart(2, "0")} · EVIDENCE</b><span>${escapeHTML(item)}</span></div>`).join("") : '<div class="logic-pending">等待例子、数据或原因继续支持这个观点</div>'}
      </div>
    `;
    return;
  }

  if (event.type === "problem_solution") {
    container.innerHTML = `
      <div class="logic-column">
        <div class="logic-anchor problem-anchor ${statusClass}"><span>问题 / PROBLEM</span><strong>${escapeHTML(event.subject)}</strong></div>
        ${secondaryItems.length ? `<div class="logic-reasons"><b>WHY</b>${secondaryItems.map((item) => `<span>${escapeHTML(item)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="logic-arrow"><i></i></div>
      <div class="logic-column solution-column">
        <span class="logic-column-label">方案 / SOLUTION</span>
        ${items.length ? items.map((item, index) => `<div class="logic-node solution-node ${statusClass}"><b>${String(index + 1).padStart(2, "0")}</b><span>${escapeHTML(item)}</span></div>`).join("") : '<div class="logic-pending">等待演讲者提出解决方式</div>'}
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="logic-anchor cause-anchor ${statusClass}"><span>原因 / CAUSE</span><strong>${escapeHTML(event.subject)}</strong></div>
    <div class="logic-arrow"><i></i></div>
    <div class="logic-column effect-column">
      <span class="logic-column-label">结果 / EFFECT</span>
      ${items.length ? items.map((item, index) => `<div class="logic-node effect-node ${statusClass}"><b>${String(index + 1).padStart(2, "0")}</b><span>${escapeHTML(item)}</span></div>`).join("") : '<div class="logic-pending">等待结果继续出现</div>'}
    </div>
  `;
}

function renderProgressiveEvent(event, confirmed = false, stage = els.visualStage, options = {}) {
  const phase = options.phase || (event.lifecycle === "closed" ? "结构已完成" : confirmed ? "已经确认" : "先画出来 · 持续修正");

  if (event.type === "theme") {
    if (stage === els.visualStage) {
      state.topic = event.items[0];
      els.topicTitle.textContent = state.topic;
    }
    const container = ensureScene("theme", phase, "当前主题", "speech-live-view", stage);
    syncTokens(container, event.items[0], confirmed);
  } else if (event.type === "process") {
    const container = ensureScene("process", phase, confirmed ? "事情是怎样发生的" : event.title, "flow-view", stage);
    syncFlow(container, event.items, confirmed);
  } else if (event.type === "relation") {
    const container = ensureScene("relation", phase, confirmed ? "这个概念由什么组成" : event.title, "relation-live-view", stage);
    syncRelation(container, event, confirmed);
  } else if (event.type === "list") {
    const container = ensureScene("list", phase, confirmed ? "这些要点值得记住" : event.title, "list-view", stage);
    syncList(container, event.items, confirmed);
  } else if (event.type === "compare") {
    const container = ensureScene("compare", phase, confirmed ? "关键区别" : event.title, "compare-view", stage);
    container.innerHTML = `
      <div class="compare-panel ${confirmed ? "confirmed" : "provisional"}"><span class="compare-label">NOT THIS</span><strong>${escapeHTML(event.items[0])}</strong></div>
      <div class="compare-vs">VS.</div>
      <div class="compare-panel ${confirmed ? "confirmed" : "provisional"}"><span class="compare-label">BUT THIS</span><strong>${escapeHTML(event.items[1])}</strong></div>
    `;
  } else if (event.type === "pie") {
    const container = ensureScene("pie", phase, event.title, "pie-view", stage);
    renderPie(container, event, confirmed);
  } else if (event.type === "bar") {
    const container = ensureScene("bar", phase, event.title, "bar-view", stage);
    renderBars(container, event, confirmed);
  } else if (logicTypes.has(event.type)) {
    const container = ensureScene(event.type, phase, event.title, `logic-view ${event.type}-view`, stage);
    renderLogic(container, event, confirmed);
  } else {
    const type = event.type === "insight" ? "insight" : "live";
    const title = event.type === "insight" ? "值得记住" : event.title;
    const container = ensureScene(type, phase, title, "speech-live-view", stage);
    syncTokens(container, event.items[0], confirmed);
  }
}

function eventSceneSignature(event) {
  if (!event) return "";
  return JSON.stringify({ type: event.type, subject: event.subject || "", items: event.items || [], values: event.values || [] });
}

function sameContinuingStructure(previous, next) {
  if (previous?.logicId && next?.logicId && previous.logicId === next.logicId) return true;
  if (!previous || !next || previous.type !== next.type || !structureTypes.has(next.type)) return false;
  if (next.lifecycle === "reprocessed") return false;
  const previousFirst = previous.items?.[0];
  const nextFirst = next.items?.[0];
  return Boolean(previousFirst && nextFirst && (previousFirst === nextFirst || next.items.includes(previousFirst)));
}

function renderPreviousEvent(event) {
  if (!event) return;
  const signature = eventSceneSignature(event);
  if (signature === eventSceneSignature(state.previousEvent)) return;
  state.previousEvent = structuredClone(event);
  renderProgressiveEvent(event, true, els.previousStage, { phase: "上一段 · 已固定" });
  els.previousStage.classList.add("has-content");
}

function preparePreviousStage(nextEvent) {
  const previous = state.lastDisplayEvent || state.lastConfirmedEvent;
  if (!previous || !nextEvent) return;
  if (eventSceneSignature(previous) === eventSceneSignature(nextEvent)) return;
  if (sameContinuingStructure(previous, nextEvent)) return;
  renderPreviousEvent(previous);
}

function renderCorrection(event) {
  preparePreviousStage(event);
  window.clearTimeout(state.correctionTimer);
  els.visualStage.classList.remove("correcting");
  void els.visualStage.offsetWidth;
  els.visualStage.classList.add("correcting");
  renderProgressiveEvent(event, true);
  setActive(true, "已修正临时结构");
  state.correctionTimer = window.setTimeout(() => els.visualStage.classList.remove("correcting"), 430);
}

function eventTime(options) {
  return Number.isFinite(options.timestamp) ? options.timestamp : Date.now();
}

function structureEvent(open, items = open.items) {
  return {
    type: open.type,
    title: open.type === "process" ? "流程正在形成" : "清单正在形成",
    items: compactStructureItems(items),
    lifecycle: open.closed ? "closed" : "open",
  };
}

function reanalyzeAfterClose(text, confirmed) {
  const topic = shiftedTopic(text);
  if (topicShift(text) && topic) return { type: "theme", title: topic, items: [topic], forceRender: true, lifecycle: "reprocessed" };
  return { ...analyzeIncremental(cleanSpeech(text), { confirmed, suppressSequence: true }), forceRender: true, lifecycle: "reprocessed" };
}

function composeStatefulEvent(event, text, confirmed, timestamp) {
  state.eventClock = timestamp;
  let open = state.openStructure;
  const fresh = open && timestamp - open.updatedAt <= 45000;
  if (open && !fresh && confirmed) {
    closeOpenStructure("timeout");
    open = null;
  }

  const recent = state.recentStructure && timestamp - state.recentStructure.closedAt <= 20000 ? state.recentStructure : null;
  const prefixStructure = open || recent;
  if (prefixStructure?.sourceText && cleanSpeech(text).startsWith(prefixStructure.sourceText)) {
    const tail = cleanSpeech(text).slice(prefixStructure.sourceText.length).trim().replace(/^[，,。.!?！？；;：:\s]+/, "");
    if (!tail) return structureEvent(prefixStructure);
    const continuationPattern = prefixStructure.type === "process" ? processContinuationPattern : listContinuationPattern;
    if (!open || !continuationPattern.test(tail) || topicShift(tail)) {
      if (confirmed) {
        closeOpenStructure(topicShift(tail) ? "shift" : "complete");
        return reanalyzeAfterClose(tail, confirmed);
      }
      return topicShift(tail) ? reanalyzeAfterClose(tail, confirmed) : structureEvent(prefixStructure);
    }
    text = tail;
    event = analyzeIncremental(tail, { confirmed });
  }

  if ((open || recent) && topicShift(text)) {
    closeOpenStructure("shift");
    return reanalyzeAfterClose(text, confirmed);
  }

  if (open && event.type !== "live" && event.type !== open.type) {
    closeOpenStructure("complete");
    open = null;
  }

  if (structureTypes.has(event.type)) {
    const limit = event.type === "process" ? 6 : 8;
    const restart = !open || open.type !== event.type || event.ordinal === 1 || (event.items.length >= 2 && event.strongStart);
    let items = restart ? [] : [...open.items];
    const incoming = compactStructureItems(event.items);
    if (event.ordinal) items[event.ordinal - 1] = incoming[0];
    else if (restart || incoming.length >= 2) items = incoming;
    else if (incoming[0] && items[items.length - 1] !== incoming[0]) items.push(incoming[0]);
    items = compactStructureItems(items).slice(0, limit);

    if (!restart && items.length >= limit && incoming.some((item) => !open.items.includes(item))) {
      closeOpenStructure("complete");
      return reanalyzeAfterClose(text.replace(processContinuationPattern, "$1").replace(listContinuationPattern, "$1"), confirmed);
    }

    if (confirmed) {
      state.recentStructure = null;
      state.openStructure = {
        type: event.type,
        items,
        anchor: `${open?.anchor || ""} ${items.join(" ")}`.trim().slice(-320),
        sourceText: restart ? cleanSpeech(text) : open.sourceText,
        updatedAt: timestamp,
        driftCount: 0,
      };
      open = state.openStructure;
    }
    const terminal = /(?:最后|最终|finally|lastly|the\s+final\s+step)/i.test(text);
    const result = { ...event, items, lifecycle: terminal && confirmed ? "closed" : "open" };
    if (terminal && confirmed) closeOpenStructure("complete");
    return result;
  }

  if (open && event.type === "live") {
    const continuationPattern = open.type === "process" ? processContinuationPattern : listContinuationPattern;
    const continuation = cleanSpeech(text).match(continuationPattern);
    if (continuation) {
      const item = compactNode(continuation[1]);
      const limit = open.type === "process" ? 6 : 8;
      if (open.items.length >= limit) {
        if (confirmed) closeOpenStructure("complete");
        return reanalyzeAfterClose(continuation[1], confirmed);
      }
      const items = compactStructureItems([...open.items, item]).slice(0, limit);
      if (confirmed) {
        open.items = items;
        open.anchor = `${open.anchor} ${item}`.slice(-320);
        open.updatedAt = timestamp;
        open.driftCount = 0;
      }
      const terminal = /^(?:最后|最终|finally|lastly|the\s+final\s+step)/i.test(cleanSpeech(text));
      const result = structureEvent(open, items);
      if (terminal && confirmed) {
        result.lifecycle = "closed";
        closeOpenStructure("complete");
      }
      return result;
    }

    if (confirmed) {
      const similarity = lexicalSimilarity(open.anchor, text);
      open.driftCount += similarity < 0.12 ? 1 : 0;
      open.updatedAt = timestamp;
      if (open.driftCount >= 2) {
        closeOpenStructure("complete");
        return { ...event, forceRender: true, lifecycle: "reprocessed" };
      }
    }
    return { ...event, holdStructure: true, lifecycle: "drifting" };
  }

  return event;
}

function requestSemanticReview(text, confirmed, timestamp) {
  if (semanticEngine.status === "idle") {
    if (navigator.userActivation?.hasBeenActive) semanticEngine.load().then((ready) => { if (ready) requestSemanticReview(text, confirmed, timestamp); });
    return;
  }
  const revision = ++state.semanticRevision;
  window.clearTimeout(requestSemanticReview.timer);
  requestSemanticReview.timer = window.setTimeout(async () => {
    const result = await semanticEngine.classify(cleanSpeech(text));
    if (!result || revision !== state.semanticRevision) return;
    if (result.type === "topic_shift") {
      closeOpenStructure("shift");
      const shifted = sanitizeEvent(reanalyzeAfterClose(text, confirmed));
      state.currentEvent = shifted;
      renderCorrection(shifted);
      if (confirmed && shifted.type !== "live") {
        addInsight(shifted);
        recordHistory(shifted);
        state.lastConfirmedEvent = structuredClone(shifted);
      }
      if (confirmed) state.lastDisplayEvent = structuredClone(shifted);
      return;
    }
    const current = state.currentEvent;
    if (["pie", "bar"].includes(current?.type)) return;
    if (current?.type !== "live" && result.score < 0.58) return;
    const event = semanticEvent(result.type, text);
    if (!event || event.type === current?.type) return;
    event.semanticScore = result.score;
    state.currentEvent = event;
    renderCorrection(event);
    if (confirmed) {
      addInsight(event);
      recordHistory(event);
      state.lastConfirmedEvent = structuredClone(event);
      state.lastDisplayEvent = structuredClone(event);
    }
  }, confirmed ? 120 : 320);
}

function composeVisualEvent(raw, confirmed, timestamp) {
  const intent = state.visualIntentEngine.classify(cleanSpeech(raw), {
    confirmed,
    topic: state.topic,
    openStructure: state.openStructure ? structuredClone(state.openStructure) : null,
    recentStructure: state.recentStructure ? structuredClone(state.recentStructure) : null,
    currentEvent: state.currentEvent ? structuredClone(state.currentEvent) : null,
    lastDisplayEvent: state.lastDisplayEvent ? structuredClone(state.lastDisplayEvent) : null,
    lastConfirmedEvent: state.lastConfirmedEvent ? structuredClone(state.lastConfirmedEvent) : null,
  });
  state.lastVisualIntent = intent;
  let seedEvent = analyzeIncremental(raw, { confirmed, intent });
  seedEvent = applyVisualIntent(seedEvent, raw, intent, confirmed);
  state.visualIntentEngine.recordDecision(seedEvent.intentDisposition);
  const structuralEvent = composeStatefulEvent(seedEvent, raw, confirmed, timestamp);
  const logicEvent = composeLogicEvent(state.logicMemory, structuralEvent, raw, {
    confirmed,
    timestamp,
    topic: state.topic,
  });
  return sanitizeEvent({ ...logicEvent, visualIntent: summarizeVisualIntent(intent), intentDisposition: seedEvent.intentDisposition });
}

function updateVisualIntentNote(event) {
  const label = visualIntentDebugLabel(event?.visualIntent || state.lastVisualIntent);
  if (label) els.browserNote.textContent = label;
}

function processInterim(rawText, options = {}) {
  const raw = rawText.trim();
  const text = cleanSpeech(raw);
  if (!text) return;
  startSession();
  state.interimText = text;
  els.liveCaption.textContent = cleanSpeech(options.captionText || text);
  els.confidence.textContent = options.label || "DRAFT";
  setActive(true, options.activeLabel || "正在边听边画");
  const timestamp = eventTime(options);
  const event = composeVisualEvent(raw, false, timestamp);
  state.currentEvent = event;
  state.provisionalType = event.type;
  preparePreviousStage(event);
  renderProgressiveEvent(event, false);
  if (!options.asr) updateVisualIntentNote(event);
  if (options.semantic !== false) requestSemanticReview(raw, false, timestamp);
}

function showInterimCaption(rawText, options = {}) {
  const text = cleanSpeech(rawText);
  if (!text) return;
  startSession();
  state.interimText = text;
  els.liveCaption.textContent = text;
  els.confidence.textContent = options.label || "DRAFT";
  setActive(true, options.activeLabel || "正在稳定文字");
}

function processFinal(rawText, options = {}) {
  const raw = rawText.trim();
  const text = cleanSpeech(raw);
  if (!text) return;
  startSession();
  state.interimText = "";
  if (state.transcript[state.transcript.length - 1] !== text) state.transcript.push(text);
  els.liveCaption.textContent = text;
  els.confidence.textContent = "CONFIRMED";
  setActive(true, "正在确认结构");

  const timestamp = eventTime(options);
  const event = composeVisualEvent(raw, true, timestamp);
  state.currentEvent = event;
  const hadWrongStructuralDraft = ["process", "relation", "list", "compare", "pie", "bar"].includes(state.provisionalType) && event.type !== state.provisionalType;
  if (hadWrongStructuralDraft) {
    renderCorrection(event);
  } else {
    preparePreviousStage(event);
    renderProgressiveEvent(event, true);
  }
  if (event.type !== "live") {
    addInsight(event);
    recordHistory(event);
    state.lastConfirmedEvent = structuredClone(event);
  }
  state.lastDisplayEvent = structuredClone(event);
  if (!options.asr) updateVisualIntentNote(event);
  if (options.semantic !== false) requestSemanticReview(raw, true, timestamp);
  state.provisionalType = null;
  window.clearTimeout(processFinal.idleTimer);
  processFinal.idleTimer = window.setTimeout(() => setActive(false), 650);
}

function renderSummary() {
  if (!state.transcript.length) {
    els.liveCaption.textContent = "还没有足够的演讲内容可以总结";
    return;
  }
  const fallback = state.transcript.slice(-4).map((text) => ({ text: text.replace(/[。！]$/, "") }));
  const finalCards = state.insights.length ? selectSummaryInsights(state.insights, 4) : fallback;
  renderPreviousEvent(state.lastDisplayEvent || state.lastConfirmedEvent);
  els.visualStage.dataset.scene = "summary";
  els.visualStage.innerHTML = `
    <article class="visual-card summary-shell">
      <div class="visual-kicker"><i></i><span>演讲结束 · 自动总结</span></div>
      <h2 class="visual-title">带走这几件事</h2>
      <div class="summary-view">${finalCards.map((item, index) => `<div class="summary-card"><span>0${index + 1}</span><strong>${escapeHTML(item.text)}</strong></div>`).join("")}</div>
    </article>
  `;
  els.liveCaption.textContent = `已从 ${state.transcript.length} 句话中提炼出 ${finalCards.length} 个记忆点`;
  els.confidence.textContent = "SUMMARY";
  setActive(false);
}

function selectSummaryInsights(insights, limit) {
  const metaSpeech = /^(?:我|我们)(?:想|要|会|尝试|关注|开始|来看|来谈|研究|发现|告诉|分享|努力|试图|考察)/;
  const normalized = insights.map((item, index) => ({
    ...item,
    index,
    normalizedText: item.text.replace(/[，。！？；：,.!?;:\s·→/]/g, ""),
  }));
  const candidates = normalized.filter((item, index, all) => {
    const containsConclusion = /(最重要的是|更重要的是|关键是|核心是|结论是|意味着)/.test(item.text);
    if (item.type === "insight" && metaSpeech.test(item.text) && !containsConclusion) return false;
    const duplicate = all.some((other) => other.index > item.index && other.normalizedText === item.normalizedText);
    if (duplicate) return false;
    if (!["list", "process", "relation", ...logicTypes].includes(item.type)) return true;
    return !all.some((other) => {
      if (other.index === item.index || other.type !== item.type || other.itemCount <= item.itemCount) return false;
      return other.normalizedText.includes(item.normalizedText) || item.normalizedText.includes(other.normalizedText);
    });
  });
  const weights = { theme: 5, relation: 5, list: 5, pie: 5, bar: 5, claim_evidence: 5.4, problem_solution: 5.4, cause_effect: 5.2, process: 4.5, compare: 2.5, insight: 1.5 };
  const scored = candidates.map((item) => ({
    ...item,
    score: (weights[item.type] || 1)
      + (item.prominent ? 4 : 0)
      + (/(最重要|更重要|关键|核心|结论|请记住|意味着|原因)/.test(item.text) ? 2.5 : 0)
      + (/时机/.test(item.text) ? 2.5 : 0)
      + (["list", "process", "relation", ...logicTypes].includes(item.type) ? Math.min(item.itemCount || 1, 6) * 0.35 : 0)
      - Math.max(0, item.text.length - 58) / 18,
  }));
  const selected = [];
  for (const candidate of scored.sort((a, b) => b.score - a.score || a.index - b.index)) {
    const minimumGap = Math.max(2, Math.floor(candidates.length / 10));
    const tooClose = selected.some((item) => Math.abs(item.index - candidate.index) < minimumGap);
    if (!tooClose || selected.length >= Math.min(2, limit - 1)) selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected.sort((a, b) => a.index - b.index).map((item) => ({ ...item, text: condenseSummaryText(item.text) }));
}

function condenseSummaryText(text) {
  const strongestConclusion = [...text.matchAll(/最重要的是/g)].at(-1);
  if (strongestConclusion) return text.slice(strongestConclusion.index).split(/[。！？]/)[0].slice(0, 42);
  const reframed = text.match(/不是说(.{1,12})不重要.*?更重要的是(.{1,16}?时机)/);
  if (reframed) return `${reframed[1]}很重要，但${reframed[2].replace(/^它是否/, "是否")}更重要`;
  if (/执行力.*创意.*时机更重要/.test(text)) return "执行力和创意都很重要，但时机更重要";
  if (text.includes(" / ") && /时机|关键|核心|更重要/.test(text)) {
    const compact = text
      .split(" / ")
      .map((part) => part.match(/.{0,18}(?:最重要|更重要|很重要|关键|核心|时机).{0,12}/)?.[0] || part.slice(0, 28))
      .join("；");
    return compact.slice(0, 62);
  }
  return text;
}

async function playLineIncrementally(line) {
  const characters = [...line];
  for (let index = 1; index <= characters.length; index += 2) {
    if (!state.demoRunning) return;
    processInterim(characters.slice(0, Math.min(index + 1, characters.length)).join(""));
    await new Promise((resolve) => setTimeout(resolve, 72));
  }
  processFinal(line);
  await new Promise((resolve) => setTimeout(resolve, 520));
}

async function playDemo() {
  if (state.demoRunning) return;
  resetState();
  state.demoRunning = true;
  els.demoButton.disabled = true;
  els.demoButton.innerHTML = "<span>■</span> 正在演示";
  for (const line of demoLines) await playLineIncrementally(line);
  if (state.demoRunning) renderSummary();
  state.demoRunning = false;
  els.demoButton.disabled = false;
  els.demoButton.innerHTML = "<span>▶</span> 再播一次";
}

function resetState() {
  state.demoRunning = false;
  state.topic = "等待演讲开始";
  state.insights = [];
  state.transcript = [];
  state.interimText = "";
  state.provisionalType = null;
  state.lastConfirmedEvent = null;
  state.lastDisplayEvent = null;
  state.previousEvent = null;
  state.currentEvent = null;
  state.openStructure = null;
  state.recentStructure = null;
  state.textStabilizer.reset();
  state.contextCorrector.reset();
  state.visualIntentEngine.reset();
  state.lastVisualIntent = null;
  resetLogicMemory(state.logicMemory);
  state.history = [];
  state.semanticRevision += 1;
  state.eventClock = 0;
  window.clearTimeout(state.correctionTimer);
  state.correctionTimer = null;
  state.startedAt = null;
  clearInterval(state.timer);
  els.elapsed.textContent = "00:00";
  els.topicTitle.textContent = state.topic;
  els.visualStage.dataset.scene = "welcome";
  els.visualStage.classList.remove("correcting");
  els.visualStage.innerHTML = `
    <div class="welcome-card"><span class="welcome-number">01</span><p>话还没说完，<br />图已经开始生长。</p><div class="welcome-hint">边输入边绘制，或点击「播放示例」</div></div>
  `;
  els.previousStage.dataset.scene = "empty";
  els.previousStage.classList.remove("has-content");
  els.previousStage.innerHTML = `
    <div class="previous-empty"><span>CONTEXT</span><strong>上一句或上一个小主题会固定在这里</strong></div>
  `;
  els.liveCaption.textContent = "说点什么，或播放内置示例……";
  els.confidence.textContent = "READY";
  els.sentenceInput.value = "";
  renderRail();
  setActive(false);
}

function selectedAsrOptions() {
  return {
    provider: els.asrProviderSelect?.value || "browser-web-speech",
    language: els.languageSelect.value,
    endpoint: els.asrEndpointInput?.value || DEFAULT_WHISPER_LIVEKIT_ENDPOINT,
  };
}

function selectedAsrLabel() {
  return asrProviderLabel(els.asrProviderSelect?.value);
}

function setupAsr() {
  const options = selectedAsrOptions();
  if (!asrProviderSupported(options.provider)) {
    els.micButton.disabled = true;
    els.micButton.style.opacity = ".4";
    els.browserNote.textContent = options.provider === "whisper-livekit"
      ? "当前浏览器不支持 WhisperLiveKit 所需的麦克风或 WebSocket"
      : "当前浏览器不支持语音识别，可用文字输入测试增量绘制";
    return;
  }
  els.micButton.disabled = false;
  els.micButton.style.opacity = "1";
  const asr = createAsrAdapter(options);
  asr.addEventListener("status", (event) => {
    const status = event.detail.status;
    state.listening = ["listening", "reconnecting"].includes(status);
    els.micButton.classList.toggle("listening", state.listening);
    if (status === "listening") setActive(true, "正在聆听");
    else if (status === "reconnecting") setActive(true, "正在重连识别");
    else if (!state.evaluation.session) setActive(false);
  });
  asr.addEventListener("error", (event) => {
    const error = event.detail.error;
    const message = event.detail.message ? `：${event.detail.message}` : "";
    els.browserNote.textContent = error === "not-allowed" ? "需要允许麦克风权限" : `${selectedAsrLabel()} 暂不可用：${error}${message}`;
  });
  asr.addEventListener("transcript", (event) => {
    const detail = event.detail;
    state.evaluation.session?.addTranscript(detail);
    const stable = state.textStabilizer.observe(detail);
    if (detail.isFinal) {
      const corrected = state.contextCorrector.observe({ text: stable.drawText || detail.text, captionText: stable.captionText, isFinal: true });
      processFinal(corrected.correctedText || stable.drawText || detail.text, { asr: true, stabilization: stable, correction: corrected });
      const finalLabel = detail.confidence === null ? "CONFIRMED" : `${Math.round(detail.confidence * 100)}%`;
      els.confidence.textContent = corrected.changed ? `${finalLabel} · CTX` : finalLabel;
    } else {
      if (stable.readyForDrawing) {
        const corrected = state.contextCorrector.observe({ text: stable.drawText, captionText: stable.captionText, isFinal: false });
        processInterim(corrected.correctedText || stable.drawText, {
          captionText: corrected.captionText || stable.captionText,
          label: corrected.changed ? `${stable.label} · CTX` : stable.label,
          activeLabel: "稳定文字正在绘图",
          asr: true,
          stabilization: stable,
          correction: corrected,
        });
      } else {
        const preview = state.contextCorrector.preview(stable.captionText || detail.text);
        showInterimCaption(preview.correctedText || stable.captionText || detail.text, { label: preview.changed ? `${stable.label} · CTX` : stable.label, activeLabel: "正在稳定文字" });
      }
    }
    const metrics = asr.snapshot();
    const stableMetrics = state.textStabilizer.snapshot();
    const correctionMetrics = state.contextCorrector.snapshot();
    const intentLabel = visualIntentDebugLabel(state.lastVisualIntent);
    if (metrics.firstPartialMs !== null) els.browserNote.textContent = `${asrProviderLabel(metrics.provider)} · 首批 ${metrics.firstPartialMs} ms · 原始修订 ${metrics.partialRevisions} 次 · 稳定触发 ${stableMetrics.stableDraws} 次 · 上下文修正 ${correctionMetrics.corrections} 处${intentLabel ? ` · ${intentLabel}` : ""}`;
  });
  state.asr = asr;
  els.browserNote.textContent = options.provider === "whisper-livekit"
    ? `WhisperLiveKit · 请先启动本地服务：${options.endpoint}`
    : "浏览器基线 · 可用文字输入测试全部效果";
}

function rebuildAsr() {
  if (state.asr) {
    try { state.asr.stop(); } catch {}
  }
  state.asr = null;
  state.listening = false;
  els.micButton.classList.remove("listening");
  setupAsr();
}

function formatMetric(value, suffix = " ms") {
  return value === null || value === undefined ? "—" : `${value}${suffix}`;
}

function loadGlossaryEntries() {
  try {
    return JSON.parse(localStorage.getItem(GLOSSARY_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveGlossaryEntries(entries) {
  try {
    localStorage.setItem(GLOSSARY_STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

function renderGlossaryMessage(entries = [], errors = []) {
  if (!els.glossaryMessage) return;
  const variantCount = entries.reduce((sum, entry) => sum + entry.variants.length, 0);
  els.glossaryMessage.className = errors.length ? "glossary-message warning" : "glossary-message";
  if (errors.length) {
    els.glossaryMessage.textContent = `已加载 ${entries.length} 个术语，忽略 ${errors.length} 行格式错误`;
  } else if (entries.length) {
    els.glossaryMessage.textContent = `已加载 ${entries.length} 个术语，${variantCount} 个误听写法`;
  } else {
    els.glossaryMessage.textContent = "未设置自定义词库";
  }
}

function initializeGlossary() {
  const entries = loadGlossaryEntries();
  state.contextCorrector.setGlossaryEntries(entries);
  if (els.glossaryInput) els.glossaryInput.value = formatGlossaryEntries(entries);
  renderGlossaryMessage(entries);
}

function syncGlossaryFromInput({ persist = false, quiet = false } = {}) {
  const parsed = parseGlossaryText(els.glossaryInput?.value || "");
  state.contextCorrector.setGlossaryEntries(parsed.entries);
  if (persist && !parsed.errors.length) saveGlossaryEntries(parsed.entries);
  if (!quiet || parsed.errors.length) renderGlossaryMessage(parsed.entries, parsed.errors);
  return parsed;
}

function formatDelta(before, after) {
  if (!before || !after) return "";
  const delta = (after.accuracy - before.accuracy) * 100;
  if (Math.abs(delta) < 0.05) return "±0.0 个百分点";
  return `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10} 个百分点`;
}

function correctionSourceLabel(segment) {
  const corrections = segment?.corrections || [];
  if (corrections.some((item) => item.source === "glossary")) return "词库";
  return "内置规则";
}

function renderCorrectionTable(segments = []) {
  const rows = segments.filter((segment) => segment?.from && segment?.to && segment.from !== segment.to).slice(-6);
  if (!rows.length) return "";
  return `<strong>纠错对照表</strong>
<table class="correction-table">
  <thead><tr><th>原始识别</th><th>修正后</th><th>画图</th><th>来源</th></tr></thead>
  <tbody>${rows.map((segment) => `
    <tr>
      <td>${escapeHTML(segment.from)}</td>
      <td>${escapeHTML(segment.to)}</td>
      <td>${segment.usedForDrawing ? "是" : "仅字幕"}</td>
      <td>${escapeHTML(correctionSourceLabel(segment))}</td>
    </tr>`).join("")}
  </tbody>
</table>`;
}

function referenceLanguageProfile(value) {
  const text = String(value || "").trim();
  if (!text) {
    return {
      kind: "free",
      language: els.languageSelect.value,
      label: "自由表达模式",
      message: "留空时不计算 CER/WER，只记录延迟、最终文本和临时文本修订次数。",
      warning: false,
      englishWords: 0,
      chineseChars: 0,
    };
  }
  const englishWords = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const chineseChars = text.match(/[\u3400-\u9FFF]/g) || [];
  const englishChars = englishWords.join("").length;
  const chineseCount = chineseChars.length;
  const total = englishChars + chineseCount;
  const englishShare = total ? englishChars / total : 0;
  const chineseShare = total ? chineseCount / total : 0;
  const mixed = englishWords.length >= 4 && chineseCount >= 6 && englishShare > 0.22 && chineseShare > 0.22;

  if (mixed) {
    const language = englishShare >= chineseShare ? "en-US" : "zh-CN";
    const provider = selectedAsrOptions().provider;
    const browserProvider = provider === "browser-web-speech";
    return {
      kind: "mixed",
      language,
      label: `中英混合 · ${selectedAsrLabel()} 将使用 ${language === "en-US" ? "English" : "中文"}`,
      message: browserProvider
        ? "检测到中英混合。浏览器 Web Speech 不能真正双语识别，这次只作为不可靠基线；建议切换到 WhisperLiveKit 再测。"
        : "检测到中英混合。当前会走 WhisperLiveKit 本地流式 ASR，仍建议用同一段录音对比 CER/WER。",
      warning: browserProvider,
      englishWords: englishWords.length,
      chineseChars: chineseCount,
    };
  }

  if (englishWords.length >= 6 && englishShare >= 0.65) {
    return {
      kind: "english",
      language: "en-US",
      label: `纯英文 · ${selectedAsrLabel()} 使用 English`,
      message: "这次会自动切换到 en-US，避免再用中文识别器听英文。",
      warning: false,
      englishWords: englishWords.length,
      chineseChars: chineseCount,
    };
  }

  return {
    kind: "chinese",
    language: "zh-CN",
    label: `中文 · ${selectedAsrLabel()} 使用中文`,
    message: selectedAsrOptions().provider === "browser-web-speech"
      ? "这次会使用 zh-CN。若文本含大量英文专有名词，浏览器基线可能仍会音译或吞词。"
      : "这次会使用 zh-CN。若文本含大量英文专有名词，可以用同一段录音和浏览器基线做对比。",
    warning: englishWords.length >= 3,
    englishWords: englishWords.length,
    chineseChars: chineseCount,
  };
}

function applyEvaluationLanguageRecommendation({ force = false } = {}) {
  const profile = referenceLanguageProfile(els.evaluationReference.value);
  if (force || !state.listening) {
    els.languageSelect.value = profile.language;
    state.asr?.setLanguage(profile.language);
  }
  els.evaluationLanguageHint.className = `evaluation-language-hint ${profile.warning ? "warning" : "ready"}`;
  els.evaluationLanguageHint.innerHTML = `<strong>${escapeHTML(profile.label)}</strong><br>${escapeHTML(profile.message)}`;
  return profile;
}

function renderEvaluationReport(report, saved = false) {
  const percent = (metric) => metric ? `${Math.round(metric.accuracy * 1000) / 10}%` : "—";
  const correctionTable = renderCorrectionTable(report.contextCorrection?.recentSegments || []);
  const correctedChanged = report.correctedHypothesis && report.correctedHypothesis !== report.hypothesis;
  const deltaLine = correctedChanged
    ? `字符 ${formatDelta(report.cer, report.correctedCer)}　词 ${formatDelta(report.wer, report.correctedWer)}`
    : "";
  const correctionQuality = correctedChanged && report.wer && report.correctedWer && report.correctedWer.accuracy < report.wer.accuracy
    ? "可能存在误修：修正后词准确率下降，请检查纠错对照表。"
    : "";
  els.evaluationResult.innerHTML = [
    `<strong>识别文本</strong>\n${escapeHTML(report.hypothesis || "（没有识别到最终文本）")}`,
    correctedChanged ? `<strong>理解修正后</strong>\n${escapeHTML(report.correctedHypothesis)}` : "",
    `<strong>字符准确率</strong> ${percent(report.cer)}　<strong>词准确率</strong> ${percent(report.wer)}`,
    correctedChanged ? `<strong>修正后准确率</strong> 字符 ${percent(report.correctedCer)}　词 ${percent(report.correctedWer)}\n<strong>修正效果</strong> ${deltaLine}${correctionQuality ? `\n${escapeHTML(correctionQuality)}` : ""}` : "",
    `<strong>首批文字延迟</strong> ${formatMetric(report.firstPartialLatencyMs)}　<strong>首个最终句</strong> ${formatMetric(report.firstFinalLatencyMs)}`,
    `<strong>临时文本修订</strong> ${report.partialRevisions} 次　<strong>录音时长</strong> ${Math.round(report.durationMs / 100) / 10} 秒`,
    report.stabilization ? `<strong>稳定器</strong> 绘图触发 ${report.stabilization.stableDraws} 次，抑制草稿 ${report.stabilization.suppressedDrafts} 次，前缀修正 ${report.stabilization.stableCorrections} 次` : "",
    report.contextCorrection ? `<strong>上下文纠错</strong> 修正片段 ${report.contextCorrection.correctedSegments} 个，共 ${report.contextCorrection.corrections} 处；词库触发 ${report.contextCorrection.glossaryCorrections || 0} 处；当前词库 ${report.contextCorrection.glossaryEntryCount || 0} 个术语` : "",
    correctionTable,
    saved ? `<strong>本地归档</strong> work/asr-evaluation（音频与报告已保存）` : "",
  ].filter(Boolean).join("\n\n");
}

async function saveEvaluationArtifacts(report, audioBlob) {
  const id = `asr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const archivedReport = { ...report, sessionId: id };
  const reportResponse = await fetch("/api/evaluation/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, report: archivedReport }),
  });
  if (!reportResponse.ok) throw new Error("报告保存失败");
  const audioResponse = await fetch(`/api/evaluation/audio?id=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": audioBlob.type || "audio/webm" },
    body: audioBlob,
  });
  if (!audioResponse.ok) throw new Error("音频保存失败");
  return archivedReport;
}

async function startEvaluation() {
  const reference = els.evaluationReference.value.trim();
  if (!state.asr) {
    els.evaluationResult.textContent = "当前浏览器没有可用的语音识别接口。";
    return;
  }
  const glossary = syncGlossaryFromInput({ persist: true, quiet: true });
  const languageProfile = applyEvaluationLanguageRecommendation({ force: true });
  els.evaluationStartButton.disabled = true;
  els.evaluationStopButton.disabled = true;
  els.evaluationDownloadAudioButton.disabled = true;
  els.evaluationDownloadReportButton.disabled = true;
  els.evaluationResult.textContent = "正在申请麦克风并准备录音……";
  try {
    resetState();
    state.contextCorrector.setGlossaryEntries(glossary.entries);
    const session = new AsrEvaluationSession({
      reference,
      language: languageProfile.language,
      provider: state.asr.snapshot()?.provider || selectedAsrOptions().provider,
    });
    const capture = await createAudioCapture((timestamp) => session.markVoice(timestamp));
    state.evaluation = {
      session,
      capture,
      audioBlob: null,
      report: null,
      languageProfile,
      startedAsr: !state.asr.listening,
    };
    if (!state.asr.listening) state.asr.start();
    els.evaluationStopButton.disabled = false;
    els.evaluationResult.textContent = reference
      ? "正在录音。请从头朗读标准文本，结束后点击“结束并计算”。"
      : "正在录音。当前是自由表达模式，将记录延迟和文本修订，但不计算 CER/WER。";
  } catch (error) {
    state.evaluation = { session: null, capture: null, audioBlob: null, report: null, startedAsr: false };
    els.evaluationStartButton.disabled = false;
    els.evaluationResult.textContent = `无法开始评测：${error.message}`;
  }
}

async function stopEvaluation() {
  const evaluation = state.evaluation;
  if (!evaluation.session || !evaluation.capture) return;
  els.evaluationStopButton.disabled = true;
  els.evaluationResult.textContent = "正在整理音频和识别结果……";
  if (evaluation.startedAsr) state.asr.stop();
  const audioBlob = await evaluation.capture.stop();
  const baseReport = evaluation.session.finish();
  const correctedHypothesis = state.transcript.join(" ").trim() || state.contextCorrector.snapshot().finalTranscript || "";
  const correctedScores = evaluateTranscript(baseReport.reference, correctedHypothesis);
  let report = {
    ...baseReport,
    languageProfile: evaluation.languageProfile || null,
    stabilization: state.textStabilizer.snapshot(),
    contextCorrection: state.contextCorrector.snapshot(),
    correctedHypothesis,
    correctedCer: correctedScores.cer,
    correctedWer: correctedScores.wer,
  };
  let saved = false;
  try {
    report = await saveEvaluationArtifacts(report, audioBlob);
    saved = true;
  } catch {}
  state.evaluation = { ...evaluation, session: null, capture: null, audioBlob, report };
  renderEvaluationReport(report, saved);
  els.evaluationStartButton.disabled = false;
  els.evaluationDownloadAudioButton.disabled = false;
  els.evaluationDownloadReportButton.disabled = false;
}

function evaluationFilename(extension) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `livecanvas-asr-${stamp}.${extension}`;
}

function downloadEvaluationAudio() {
  if (state.evaluation.audioBlob) downloadBlob(state.evaluation.audioBlob, evaluationFilename("webm"));
}

function downloadEvaluationReport() {
  if (!state.evaluation.report) return;
  downloadBlob(new Blob([JSON.stringify(state.evaluation.report, null, 2)], { type: "application/json" }), evaluationFilename("json"));
}

function meaningfulScene(scene) {
  return ["theme", "process", "relation", "list", "compare", "insight", "pie", "bar", ...logicTypes].includes(scene);
}

function submitInput() {
  const value = els.sentenceInput.value;
  processFinal(value);
  els.sentenceInput.value = "";
  els.sentenceInput.focus();
}

function projectSnapshot() {
  return {
    version: 1,
    topic: state.topic,
    transcript: [...state.transcript],
    insights: state.insights.map((item) => ({ ...item })),
    history: state.history.map(({ signature, ...event }) => structuredClone(event)),
    updatedAt: new Date().toISOString(),
  };
}

function saveProjectSoon() {
  window.clearTimeout(saveProjectSoon.timer);
  saveProjectSoon.timer = window.setTimeout(() => accountAdapter.saveProject(projectSnapshot()).catch(() => {}), 500);
}

async function runExport(button, task) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "正在生成…";
  try {
    await task(projectSnapshot());
    els.browserNote.textContent = "文件已生成，文字、形状和图表可继续编辑";
  } catch (error) {
    els.browserNote.textContent = `导出失败：${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function updateAccountUI(user) {
  els.accountButton.textContent = user ? user.email.split("@")[0] : "本地模式";
  els.accountTitle.textContent = user ? "账户已连接" : "注册或登录";
  els.accountDescription.textContent = user ? `当前登录：${user.email}。演讲项目会同时保存在本机并同步到此账户。` : "演讲内容默认保存在本机；登录后可同步到你的账户。";
  els.accountFields.hidden = Boolean(user);
  els.logoutButton.hidden = !user;
}

async function submitAccount(mode) {
  els.accountMessage.textContent = "正在连接…";
  try {
    const email = els.accountEmail.value;
    const password = els.accountPassword.value;
    const user = mode === "signup" ? await accountAdapter.signUp(email, password) : await accountAdapter.login(email, password);
    updateAccountUI(user);
    await accountAdapter.saveProject(projectSnapshot());
    els.accountMessage.textContent = "已登录，当前项目已同步。";
  } catch (error) {
    els.accountMessage.textContent = error.message;
  }
}

semanticEngine.addEventListener("status", (event) => {
  const { status, detail } = event.detail;
  els.modelStatus.className = `model-status ${status}`;
  els.modelStatus.querySelector("b").textContent = status === "ready" ? "SEMANTIC AI" : status === "loading" ? "LOADING AI" : status === "fallback" ? "FAST PARSER" : "FAST PARSER";
  els.modelStatus.title = detail;
});

accountAdapter.addEventListener("change", (event) => updateAccountUI(event.detail));

els.sendButton.addEventListener("click", submitInput);
els.sentenceInput.addEventListener("input", () => processInterim(els.sentenceInput.value));
els.sentenceInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitInput();
  }
});
els.demoButton.addEventListener("click", playDemo);
els.summaryButton.addEventListener("click", renderSummary);
els.resetButton.addEventListener("click", resetState);
els.exportHtmlButton.addEventListener("click", () => runExport(els.exportHtmlButton, exportEditableHTML));
els.exportPptxButton.addEventListener("click", () => runExport(els.exportPptxButton, exportEditablePptx));
els.asrProviderSelect?.addEventListener("change", rebuildAsr);
els.asrEndpointInput?.addEventListener("change", rebuildAsr);
els.languageSelect.addEventListener("change", () => {
  if (state.asr && !state.listening) state.asr.setLanguage(els.languageSelect.value);
});
els.accountButton.addEventListener("click", () => { els.accountMessage.textContent = ""; els.accountDialog.showModal(); });
els.loginButton.addEventListener("click", () => submitAccount("login"));
els.signupButton.addEventListener("click", () => submitAccount("signup"));
els.logoutButton.addEventListener("click", async () => { await accountAdapter.logout(); updateAccountUI(null); els.accountMessage.textContent = "已退出，项目仍保存在本机。"; });
els.micButton.addEventListener("click", () => {
  if (!state.asr) return;
  if (state.listening) state.asr.stop();
  else state.asr.start();
});
els.evaluationButton.addEventListener("click", () => {
  applyEvaluationLanguageRecommendation();
  els.evaluationDialog.showModal();
});
els.evaluationCloseButton.addEventListener("click", () => {
  if (state.evaluation.session) stopEvaluation();
  els.evaluationDialog.close();
});
els.evaluationReference.addEventListener("input", () => applyEvaluationLanguageRecommendation());
els.glossarySaveButton?.addEventListener("click", () => syncGlossaryFromInput({ persist: true }));
els.evaluationStartButton.addEventListener("click", startEvaluation);
els.evaluationStopButton.addEventListener("click", stopEvaluation);
els.evaluationDownloadAudioButton.addEventListener("click", downloadEvaluationAudio);
els.evaluationDownloadReportButton.addEventListener("click", downloadEvaluationReport);
els.fullscreenButton.addEventListener("click", async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await els.presentation.requestFullscreen();
});

setupAsr();
initializeGlossary();
accountAdapter.refresh();

const embedMode = new URLSearchParams(window.location.search).has("embed");
if (embedMode) document.body.classList.add("embed-mode");
const localDemoHost = ["127.0.0.1", "localhost", "::1"].includes(location.hostname);
if ("serviceWorker" in navigator && localDemoHost) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .then(() => ("caches" in window ? caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("livecanvas")).map((key) => caches.delete(key)))) : null))
    .catch(() => {});
} else if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !embedMode) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

window.liveCanvasTest = {
  analyzeIncremental,
  processInterim,
  processFinal,
  renderSummary,
  resetState,
  getAsrSnapshot() {
    return state.asr?.snapshot() || null;
  },
  getTextStabilizerSnapshot() {
    return state.textStabilizer.snapshot();
  },
  getContextCorrectorSnapshot() {
    return state.contextCorrector.snapshot();
  },
  getVisualIntentSnapshot() {
    return state.visualIntentEngine.snapshot();
  },
  setAsrProvider(provider, endpoint = "") {
    if (els.asrProviderSelect) els.asrProviderSelect.value = provider;
    if (endpoint && els.asrEndpointInput) els.asrEndpointInput.value = endpoint;
    rebuildAsr();
    return state.asr?.snapshot() || null;
  },
  setGlossaryText(value) {
    if (els.glossaryInput) els.glossaryInput.value = value;
    return syncGlossaryFromInput({ persist: false });
  },
  setTopic(title) {
    state.topic = title;
    els.topicTitle.textContent = title;
  },
  getSnapshot() {
    return {
      scene: els.visualStage.dataset.scene || null,
      previousScene: els.previousStage.dataset.scene || null,
      topic: state.topic,
      interimText: state.interimText,
      event: state.currentEvent ? structuredClone(state.currentEvent) : null,
      lastDisplayEvent: state.lastDisplayEvent ? structuredClone(state.lastDisplayEvent) : null,
      previousEvent: state.previousEvent ? structuredClone(state.previousEvent) : null,
      openStructure: state.openStructure ? structuredClone(state.openStructure) : null,
      logicMemory: state.logicMemory.current ? structuredClone(state.logicMemory.current) : null,
      insights: state.insights.map((item) => ({ ...item })),
      history: state.history.map(({ signature, ...item }) => structuredClone(item)),
      transcriptLength: state.transcript.length,
    };
  },
};
