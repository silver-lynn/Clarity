const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

const prototypes = {
  theme: [
    "The topic of this talk is real-time visual communication.",
    "今天讨论的主题是实时视觉表达。",
  ],
  process: [
    "There are several sequential steps: collect, analyze, decide, and deliver.",
    "Start by gathering the inputs, once that is done validate them, and finish by publishing the result.",
    "This describes a procedure where one action happens after another.",
    "这件事按照先后步骤完成，先收集，再分析，最后交付。",
  ],
  relation: [
    "The system consists of several components and each part belongs to the whole.",
    "The framework is composed of three parts: strategy, execution, and measurement.",
    "这个系统由多个组成部分构成，它们属于同一个整体。",
  ],
  compare: [
    "This contrasts two alternatives and explains how they differ.",
    "On the one hand one option is faster, while on the other hand the second option is safer.",
    "这句话在比较两种方案以及它们的差异。",
  ],
  insight: [
    "The key conclusion and most important takeaway is stated here.",
    "The bottom line is that timing matters more than the original plan.",
    "这里表达了最重要的结论和值得记住的观点。",
  ],
  list: [
    "The speaker is enumerating a list of distinct points or reasons.",
    "There are three independent reasons: cost, quality, and speed.",
    "演讲者正在列举多个并列的要点或原因。",
  ],
  claim_evidence: [
    "This states a claim and supports it with an example, research, data, or a concrete reason.",
    "The main point is followed by evidence that shows why the audience should believe it.",
    "先提出一个观点，再用例子、数据或原因来支持这个观点。",
  ],
  problem_solution: [
    "This identifies a problem or challenge and then proposes a solution or response.",
    "The current situation is difficult, so the speaker explains what we should do about it.",
    "这段内容先说明问题和挑战，再提出解决办法。",
  ],
  cause_effect: [
    "This explains a causal relationship where one condition produces a result or consequence.",
    "Because one thing happens, another outcome follows as a result.",
    "这段内容说明一个原因如何导致某个结果。",
  ],
  topic_shift: [
    "Now let's move on to a different topic and discuss pricing.",
    "Turning to the next issue, I want to talk about customer retention.",
    "We have finished that section; the next subject is distribution.",
    "接下来换一个主题，我们讨论定价。",
    "前面的部分讲完了，现在来看另一个问题。",
  ],
};

class SemanticEngine extends EventTarget {
  constructor() {
    super();
    this.status = "idle";
    this.extractor = null;
    this.prototypeVectors = null;
    this.error = null;
  }

  setStatus(status, detail = "") {
    this.status = status;
    this.dispatchEvent(new CustomEvent("status", { detail: { status, detail } }));
  }

  async load() {
    if (this.status === "ready") return true;
    if (this.status === "loading") return this.loadingPromise;
    this.setStatus("loading", "正在载入多语言语义模型");
    const modelLoad = (async () => {
      try {
        const { pipeline, env } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        this.extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
        const entries = Object.entries(prototypes);
        this.prototypeVectors = {};
        for (const [type, examples] of entries) {
          const output = await this.extractor(examples, { pooling: "mean", normalize: true });
          const rows = output.tolist();
          this.prototypeVectors[type] = averageVectors(rows);
        }
        this.setStatus("ready", "多语言语义模型已就绪");
        return true;
      } catch (error) {
        this.error = error;
        this.setStatus("fallback", "语义模型不可用，使用本地快速解析");
        return false;
      }
    })();
    this.loadingPromise = Promise.race([
      modelLoad,
      new Promise((resolve) => setTimeout(() => {
        if (this.status === "loading") this.setStatus("fallback", "语义模型载入超时，继续使用本地快速解析");
        resolve(false);
      }, 30000)),
    ]);
    return this.loadingPromise;
  }

  async classify(text) {
    if (this.status !== "ready" || !this.extractor || text.length < 6) return null;
    const output = await this.extractor(text, { pooling: "mean", normalize: true });
    const vector = output.tolist()[0];
    const ranked = Object.entries(this.prototypeVectors)
      .map(([type, prototype]) => ({ type, score: dot(vector, prototype) }))
      .sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const margin = top.score - (ranked[1]?.score || 0);
    return top.score >= 0.42 && margin >= 0.015 ? { ...top, margin, ranked } : null;
  }
}

function dot(a, b) {
  let value = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) value += a[index] * b[index];
  return value;
}

function averageVectors(vectors) {
  const average = new Array(vectors[0].length).fill(0);
  vectors.forEach((vector) => vector.forEach((value, index) => { average[index] += value / vectors.length; }));
  const length = Math.sqrt(dot(average, average)) || 1;
  return average.map((value) => value / length);
}

export const semanticEngine = new SemanticEngine();
