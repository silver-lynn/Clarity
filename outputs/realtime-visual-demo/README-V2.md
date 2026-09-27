# Clarity · 让思想就在眼前成形

2026-09-27 识别更新：8001 默认采用 Zipformer 实时预览、Silero 语音分段和 SenseVoice 整句确认。临时字幕可能修订，图形与总结使用确认后的文字。热词仅对预览加权，整句确认不强制替换同音字。详见 `../livecanvas-v2-test-results/ASR-ACCURACY-REPORT.md`。模型文件在项目 `work/models`；缺少确认模型时退回快速识别，可通过 `/health` 的 `confirmation` 字段核对。

服务讲解排练、小型分享和知识讲解：讲前提供背景，讲中阅读大字幕与必要的结构，讲后沿时间轴回顾。保留钴蓝与点阵标记，把注意力留给内容。

## 启动与使用

双击 `start-demo.cmd`，打开 http://127.0.0.1:4175/studio/index.html 。启动器会尝试启动本机中文流式识别服务。也可单独运行 `start-streaming-asr.cmd`；语音地址为 `ws://127.0.0.1:8001/asr`。

1. 可选：点击“讲前准备”，填写主题、上传资料并核对词表。
2. 开始录音或打字。“•••”中有内置演示、设置、人物关系模式。
3. 普通表达显示大字幕，完整的步骤、对照、数字等才展开结构；字幕不等待 Jev。
4. 用“这里不对”修正最近的表达；点击节点查看依据。“保留画面”保留图形，字幕可以继续跟随。
5. 底部时间轴按确认与修订时刻记录片段。点击或拖动回看，现场继续接收；点击“回到现场”恢复。未保存音频，不提供声音回放。
6. “带走”导出 JSON、离线可编辑 HTML 或可编辑 PPTX。

## 讲前准备

支持 UTF-8 TXT、Markdown、文字型 PDF、DOCX、PPTX。文档只在本机读取；扫描 PDF 暂不支持 OCR。单份资料 10 MB，最多 10 份，摘录合计 5 万字，词表最多 80 项。自动提取仅提供候选，用户可修改。

资料不进入讲述原话或自动生成画面，也不发送给 Jev。背景摘录、词表和文件名称随会话保存与导出，原文件不保留。

默认中文流式识别每次录音注入支持的热词，不强制替换同音词。不支持的术语会提示，并可在“讲前准备”查看名单；一项不支持的术语不会使其他热词失效。冰雪主题下的“血”提供核对入口，“出血、血液”等不触发。用户可以保存本场再次提示的纠错词对。

## 字幕与阅读

字幕保留原话，临时识别明确标注可能修订。结论突出显示，不重复绘制同内容卡片；图形出现时仍保留字幕区域。“Aa”中可调整字号、高对比和表达提示。“暂停滚动”冻结阅读位置，后台继续记录；“完整字幕”可查看全部确认原话。

表达提示仅从文字判断疑问、强调和风险，普通表达不显示；不分析声音情绪，不推断心理状态。

## 结构与 Jev

保留原有 11 类图形。单个步骤先显示字幕，后续步骤明确后展开。追加保留已有节点位置；图形区域限制高度，避免挤走字幕。

跨句理解限于明确的“补充一点”“更正一下”“但我们发现”等句式，保留之前观点及来源，再追加或并列展示修正。不是任意跨句推理，不自动解析模糊指代；旧段落可通过“全部原话”指定修订。

在“••• → 设置”启用 TypeSafe Jev。它选择字幕、强调、结构或暂留上一结构；候选文字均有原话依据。明确数字、明确认识转折和人物关系跳过远程选择。请求预算 1.8 秒；低置信度、候选差距不足、失败或超时保留基础结果；限流后冷却 30 秒。密钥只在页面内存中。

Jev 尚无有效真实密钥验收；测试使用模拟响应，不证明真实语义准确率。请求预算也不是音频到图形的端到端延迟。

## 本地语音

默认使用 sherpa-onnx 1.13.8、中文流式 Zipformer int8、CPU 2 线程，启动时预热。100ms PCM 包传入，临时结果立即显示，停顿后确认，停止时刷新尾音。当前服务限制为单场录音。

原 Whisper small 保留：启动 `start-whisperlivekit.cmd`，设置地址为 `ws://127.0.0.1:8000/asr`。浏览器识别也保留，但可能将音频发送至浏览器服务商。新中文流式模型不承诺纯英文或中英混合质量。

真实浏览器音频回放测试：采集 41 秒，总计约 42.04 秒收到尾句确认；原 small CPU 测试约 98.18 秒。测试经过 Chrome 模拟麦克风、实际采集器和真实 ASR，不是现场人声评测。首批字幕时间包含开头静音，不能当作逐词延迟；仍有错字、重复和分段问题。

模型来源：[sherpa-onnx 官方说明](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html)。模型在 `work/models/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30/`，新增依赖见 `studio/requirements-streaming.txt`。

## 人物关系与导出

人物关系保留方向、传闻、事件与来源。每页最多 6 人、12 条关系、6 个事件；复杂句与超限会提示，不能等同于完整剧情理解。

JSON 保存背景、原话、修订和画面操作，可导入恢复。HTML 可离线编辑保存，PPT 使用独立形状与原生图表。HTML/PPT 是内容成果，不包含实时录音或新版播放器界面。

## 验证

在项目根目录运行：

```
node --test work/studio-tests/core.test.mjs work/studio-tests/jev.test.mjs work/studio-tests/gossip.test.mjs work/studio-tests/experience.test.mjs
node work/studio-tests/experience-browser.cjs
node work/studio-tests/experience-regression.cjs
node work/studio-tests/streaming-live-browser.cjs
```

报告与截图见 `outputs/livecanvas-v2-test-results/EXPERIENCE-TEST-REPORT.md`。使用现有 Python 环境运行 `streaming-benchmark.py --repeats 45` 可执行约 31 分钟的真实速度录音回放。

尚未完成真实 Jev 准确率、多人嘈杂现场、不同口音，以及聋人/重听用户参与的无障碍验收。当前结果不等同于现场字幕服务的可靠性承诺。YouTube 伴读未纳入本轮。
