# LiveCanvas ASR 基线测试稿

每一段单独评测。打开页面，点击“ASR 评测”，把对应段落粘贴到“标准文本”，再从头自然朗读。不要刻意放慢速度。

评测面板会根据标准文本自动切换识别语言：纯英文会切到 `English baseline`，中文会切到 `中文基线`。中英混合段会显示橙色警告，因为浏览器识别不是真正的双语 ASR，只能作为基线。

本轮测试请额外观察画面状态：`DRAFT` 代表只显示字幕、不绘图；`STABLE+` 代表稳定前缀开始绘图；`CONFIRMED` 代表最终句已确认。评测结束后报告里会出现稳定器指标，重点看“绘图触发”是否明显少于“原始修订”。

如果英文被浏览器听成相近发音，报告会同时显示“识别文本”和“理解修正后”。下一轮请重点看 `library canvas`、`stable tax`、`girl is not to create more slides` 这类错误是否被修正，而原始识别仍保留在报告中。

如需测试自定义术语，在“本地术语 / 误听词库”中输入：

```text
Project Aurora = project or aura, project a roar
LiveCanvas = life canvas, live canvas
```

保存后再开始评测。报告里的“纠错对照表”会显示原始识别、修正后文本、是否用于画图，以及来自内置规则还是词库。

## 1. 中文

今天我们讨论的主题是实时演讲可视化。传统演示文稿需要提前准备，而实时画布会在讲话发生的时候组织信息。首先系统捕捉声音，然后识别文字，接着理解观点之间的关系，最后选择合适的图形。真正重要的不是生成更多页面，而是帮助听众更快理解演讲者的思路。

## 2. English

Today I want to explain how a live visual canvas can support a presentation. First, the system captures the speaker's voice. Next, it converts the audio into stable text. Then it identifies the topic, the evidence, and the relationships between ideas. Finally, it selects a visual structure without interrupting the speaker. The goal is not to create more slides. The goal is to make the argument easier to understand.

## 3. 中英混合

我们先定义一个核心目标，the first response should appear in less than one second。接下来系统需要识别 topic、evidence 和 cause and effect。比如用户说 mobile users account for twenty percent，画面应该出现占比；如果他说 revenue increased by twenty percent，系统应该显示增长，而不是把两个表达混在一起。最后我们会 export an editable PowerPoint file。

## 4. 数字与专有名词

在二零二六年六月十四日，我们测试了 LiveCanvas、OpenAI、Whisper 和 MiniLM。第一组有一百二十名用户，比之前的一百名增长百分之二十。第二组占总人数的百分之七十四，第三组只有百分之二点五。项目负责人是 Alex Chen，产品代号是 Project Aurora，网站地址是 live canvas dot example dot com。

## 5. 自由表达

不要使用标准文本。围绕“为什么实时视觉能够帮助听众理解复杂内容”自然讲两分钟。该段只评估延迟、文本跳动和最终可读性，不计算 CER/WER。

## 测试环境记录

测试后请记下：

- 浏览器与系统
- 麦克风类型
- 嘴到麦克风的大致距离
- 是否有空调、键盘或他人说话
- 你主观认为最明显的三个识别错误
