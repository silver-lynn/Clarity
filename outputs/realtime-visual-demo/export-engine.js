const colors = { ink: "15162D", purple: "6757E8", orange: "FF6B35", cyan: "7EE5E2", lime: "C7F36B", paper: "F4F1EA" };

function download(name, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function safeName(value) {
  return (value || "LiveCanvas").replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);
}

function eventText(event) {
  if (event.type === "relation") return `${event.subject}: ${event.items.join(", ")}`;
  if (event.type === "process") return event.items.join(" -> ");
  if (["claim_evidence", "problem_solution", "cause_effect"].includes(event.type)) return `${event.subject}${event.items?.length ? ` -> ${event.items.join(" / ")}` : ""}`;
  if (event.type === "pie" || event.type === "bar") return event.values.map((item) => `${item.label} ${item.value}%`).join(" / ");
  return event.items?.join(" / ") || "";
}

function htmlEvent(event, index) {
  const title = event.title || event.type;
  if (event.type === "pie") {
    const first = event.values[0];
    return `<section><small>0${index + 1} · DATA</small><h2 contenteditable="true">${escapeMarkup(title)}</h2><div class="pie" style="--value:${first.value}"><b>${first.value}%</b></div><p contenteditable="true">${escapeMarkup(eventText(event))}</p></section>`;
  }
  if (event.type === "bar") {
    const max = Math.max(...event.values.map((item) => item.value), 1);
    const bars = event.values.map((item) => `<div class="bar"><span>${escapeMarkup(item.label)}</span><i style="height:${Math.max(8, item.value / max * 100)}%"></i><b>${item.value}%</b></div>`).join("");
    return `<section><small>0${index + 1} · DATA</small><h2 contenteditable="true">${escapeMarkup(title)}</h2><div class="bars">${bars}</div></section>`;
  }
  if (["claim_evidence", "problem_solution", "cause_effect"].includes(event.type)) {
    const labels = { claim_evidence: "CLAIM", problem_solution: "PROBLEM", cause_effect: "CAUSE" };
    const itemLabel = { claim_evidence: "EVIDENCE", problem_solution: "SOLUTION", cause_effect: "EFFECT" };
    const nodes = event.items?.length ? event.items.map((item) => `<div class="logic-node"><small>${itemLabel[event.type]}</small><b contenteditable="true">${escapeMarkup(item)}</b></div>`).join("") : `<div class="logic-node"><small>${itemLabel[event.type]}</small><b contenteditable="true">待补充</b></div>`;
    return `<section><small>0${index + 1} · LOGIC</small><h2 contenteditable="true">${escapeMarkup(title)}</h2><div class="logic"><div class="logic-main"><small>${labels[event.type]}</small><b contenteditable="true">${escapeMarkup(event.subject)}</b></div><i>→</i><div class="logic-items">${nodes}</div></div></section>`;
  }
  return `<section><small>0${index + 1} · ${event.type.toUpperCase()}</small><h2 contenteditable="true">${escapeMarkup(title)}</h2><p contenteditable="true">${escapeMarkup(eventText(event))}</p></section>`;
}

function escapeMarkup(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function exportEditableHTML(project) {
  const sections = project.history.map(htmlEvent).join("\n");
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeMarkup(project.topic)}</title><style>
  *{box-sizing:border-box}body{margin:0;color:#15162d;background:#101126;font-family:Arial,"Microsoft YaHei",sans-serif}main{max-width:1200px;margin:auto;padding:36px}header,section{margin-bottom:18px;padding:32px;background:#f4f1ea;border-radius:8px}header h1{font-size:52px;margin:0}small{color:#6757e8;font-weight:800;letter-spacing:.12em}h2{font-size:34px}p{font-size:24px;line-height:1.45}[contenteditable]{outline:2px dashed transparent}[contenteditable]:focus{outline-color:#ff6b35}.pie{width:240px;height:240px;display:grid;place-items:center;border-radius:50%;background:conic-gradient(#6757e8 calc(var(--value)*1%),#ddd 0)}.pie:before{content:"";width:145px;height:145px;border-radius:50%;background:#f4f1ea}.pie b{position:absolute;font-size:34px}.bars{height:300px;display:flex;gap:34px;align-items:end}.bar{height:100%;flex:1;display:flex;flex-direction:column;justify-content:end;align-items:center}.bar i{width:70%;background:#6757e8}.bar b{font-size:20px}.bar span{margin-bottom:10px}.logic{display:grid;grid-template-columns:1fr 60px 1.4fr;align-items:center;gap:12px}.logic>i{text-align:center;font-size:34px}.logic-main,.logic-node{min-height:140px;padding:20px;border:2px solid #15162d;background:white;display:flex;flex-direction:column;justify-content:space-between}.logic-main{color:white;background:#6757e8}.logic-items{display:grid;grid-template-columns:1fr 1fr;gap:10px}.logic-node b,.logic-main b{font-size:21px}</style></head><body><main><header><small>EDITABLE LIVE PRESENTATION</small><h1 contenteditable="true">${escapeMarkup(project.topic)}</h1><p contenteditable="true">双击文字即可编辑。此文件不依赖原应用，可单独打开和分享。</p></header>${sections}</main></body></html>`;
  download(`${safeName(project.topic)}.html`, new Blob([html], { type: "text/html;charset=utf-8" }));
}

export async function exportEditablePptx(project) {
  if (!window.PptxGenJS) throw new Error("PPTX 导出组件未载入");
  const pptx = new window.PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "LiveCanvas";
  pptx.subject = "Editable real-time presentation";
  pptx.title = project.topic;
  pptx.company = "LiveCanvas";
  pptx.lang = "zh-CN";
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei", lang: "zh-CN" };

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: colors.paper };
  titleSlide.addText("LIVE CANVAS", { x: .7, y: .55, w: 3, h: .3, fontSize: 11, bold: true, color: colors.purple, charSpacing: 2 });
  titleSlide.addText(project.topic, { x: .7, y: 1.35, w: 11.6, h: 1.3, fontSize: 38, bold: true, color: colors.ink, breakLine: false, margin: 0 });
  titleSlide.addText("由实时演讲生成 · 所有文字、形状和图表均可编辑", { x: .72, y: 3.1, w: 7, h: .5, fontSize: 17, color: "777789", margin: 0 });
  titleSlide.addShape(pptx.ShapeType.rect, { x: .7, y: 5.7, w: 3.2, h: .12, line: { color: colors.orange }, fill: { color: colors.orange } });

  project.history.forEach((event, eventIndex) => addEventSlide(pptx, event, eventIndex));
  await pptx.writeFile({ fileName: `${safeName(project.topic)}.pptx` });
}

function addEventSlide(pptx, event, index) {
  const slide = pptx.addSlide();
  slide.background = { color: colors.paper };
  slide.addText(`0${index + 1} · ${event.type.toUpperCase()}`, { x: .55, y: .35, w: 3, h: .25, fontSize: 9, bold: true, color: colors.purple, charSpacing: 1.6, margin: 0 });
  slide.addText(event.title || event.type, { x: .55, y: .75, w: 12, h: .6, fontSize: 27, bold: true, color: colors.ink, margin: 0 });

  if (event.type === "pie") {
    const values = [...event.values];
    const sum = values.reduce((total, item) => total + item.value, 0);
    if (sum < 100) values.push({ label: "其他", value: 100 - sum });
    slide.addChart(pptx.ChartType.doughnut, [{ name: event.title, labels: values.map((item) => item.label), values: values.map((item) => item.value) }], { x: 1.2, y: 1.6, w: 5.2, h: 4.7, showLegend: true, showPercent: true, holeSize: 58, chartColors: [colors.purple, colors.orange, colors.cyan, colors.lime] });
    slide.addText(eventText(event), { x: 7, y: 2.5, w: 5, h: 1.2, fontSize: 25, bold: true, color: colors.ink, margin: 0 });
  } else if (event.type === "bar") {
    slide.addChart(pptx.ChartType.bar, [{ name: event.title, labels: event.values.map((item) => item.label), values: event.values.map((item) => item.value) }], { x: .9, y: 1.55, w: 11.5, h: 4.8, catAxisLabelFontSize: 14, valAxisLabelFontSize: 12, showValue: true, showLegend: false, chartColors: [colors.purple] });
  } else if (event.type === "process") {
    const width = Math.min(2.25, 10.8 / event.items.length);
    event.items.forEach((item, itemIndex) => {
      const x = .75 + itemIndex * (width + .24);
      slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.15 + (itemIndex % 2 ? .35 : 0), w: width, h: 2.05, rectRadius: .05, fill: { color: itemIndex % 2 ? "D8D2FF" : "FFFFFF" }, line: { color: colors.ink, width: 1.3 } });
      slide.addText(item, { x: x + .14, y: 2.65 + (itemIndex % 2 ? .35 : 0), w: width - .28, h: .9, fontSize: 17, bold: true, align: "center", valign: "mid", margin: 0 });
    });
  } else if (event.type === "relation") {
    slide.addShape(pptx.ShapeType.ellipse, { x: .75, y: 2.15, w: 2.4, h: 2.4, fill: { color: colors.ink }, line: { color: colors.ink } });
    slide.addText(event.subject, { x: .95, y: 2.75, w: 2, h: 1, fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "mid", margin: 0 });
    event.items.forEach((item, itemIndex) => slide.addText(item, { x: 4 + (itemIndex % 2) * 4.1, y: 1.65 + Math.floor(itemIndex / 2) * 1.55, w: 3.55, h: 1.05, fontSize: 18, bold: true, align: "center", valign: "mid", margin: .08, fill: { color: itemIndex % 2 ? "7EE5E2" : "D8D2FF", transparency: 18 }, line: { color: colors.ink, width: 1.2 }, radius: .2 }));
  } else if (event.type === "compare") {
    event.items.slice(0, 2).forEach((item, itemIndex) => {
      slide.addShape(pptx.ShapeType.rect, { x: .75 + itemIndex * 6.15, y: 1.7, w: 5.45, h: 4.6, fill: { color: itemIndex ? colors.purple : "FFFFFF" }, line: { color: colors.ink, width: 1.3 } });
      slide.addText(item, { x: 1.1 + itemIndex * 6.15, y: 3, w: 4.75, h: 1.6, fontSize: 26, bold: true, color: itemIndex ? "FFFFFF" : colors.ink, align: "center", valign: "mid", margin: 0 });
    });
  } else if (["claim_evidence", "problem_solution", "cause_effect"].includes(event.type)) {
    const anchorColors = { claim_evidence: colors.purple, problem_solution: colors.orange, cause_effect: "59C8C5" };
    slide.addShape(pptx.ShapeType.rect, { x: .75, y: 1.75, w: 4.25, h: 4.35, fill: { color: anchorColors[event.type] }, line: { color: colors.ink, width: 1.3 } });
    slide.addText(event.subject, { x: 1.05, y: 2.55, w: 3.65, h: 2.3, fontSize: 25, bold: true, color: event.type === "cause_effect" ? colors.ink : "FFFFFF", align: "center", valign: "mid", margin: .06 });
    slide.addText("→", { x: 5.08, y: 3.25, w: .7, h: .6, fontSize: 31, bold: true, color: colors.ink, align: "center", margin: 0 });
    const items = event.items?.length ? event.items.slice(0, 4) : ["待补充"];
    items.forEach((item, itemIndex) => {
      const x = 5.9 + (itemIndex % 2) * 3.25;
      const y = 1.75 + Math.floor(itemIndex / 2) * 2.25;
      slide.addText(item, { x, y, w: 2.95, h: 1.9, fontSize: 17, bold: true, color: colors.ink, align: "center", valign: "mid", margin: .08, fill: { color: itemIndex % 2 ? "7EE5E2" : "D8D2FF", transparency: 12 }, line: { color: colors.ink, width: 1.1 } });
    });
  } else {
    slide.addText(eventText(event), { x: 1, y: 2, w: 11.2, h: 3.3, fontSize: 29, bold: true, color: colors.ink, align: "center", valign: "mid", margin: .1, breakLine: false });
  }
}
