# Clarity

让思想在眼前成形。当前工作版本的公开源码。

## 当前能力

- 实时字幕、常规模式的中心关键词；关键词约每 450ms 跟随实时转写预览，并随确认文字修正。
- 步骤、因果、对比、数据等结构图，讲述时间轴和讲后知识树。
- 人物关系与事件；支持部分口语和断句，仍是有限规则，不是完整剧情推理。
- 甄嬛传口语示例及约 98 秒合成朗读；示例字幕按音频时间戳播放，不经过实时 ASR。
- 豆包云端识别适配、本地识别备选、TypeSafe JEV 呈现方式选择。
- JEV 需要用户自己的密钥；人物关系模式目前跳过 JEV。本次发布未进行真实付费 JEV 调用验收。
- JSON、HTML、PPTX 导出，讲前背景资料、Windows 本机加密保存密钥。

## 启动界面

安装 Node.js 20 或以上，在仓库根目录执行：

```sh
npm start
```

打开 http://127.0.0.1:4175/studio/index.html 。文字输入、规则绘图、关键词和内置示例无需密钥。根目录旧界面是开发早期版本，当前入口是 `/studio/index.html`。

## 云端识别与资料解析（Windows）

安装 Python 3.12，在仓库根目录执行：

```powershell
python -m venv work/whisperlivekit-venv
work/whisperlivekit-venv/Scripts/python.exe -m pip install -r requirements-cloud.txt
work/whisperlivekit-venv/Scripts/python.exe outputs/realtime-visual-demo/studio/cloud-asr-server.py
```

另一个终端保持 `npm start` 运行。在界面设置中填入自己的豆包 API Key，并开通对应流式识别服务。8002 服务同时负责 Windows DPAPI 密钥保存；仓库不包含任何用户密钥或加密凭证。

本地识别是可选高级路径，需要 `studio/requirements-streaming.txt` 中的额外依赖和对应模型；模型不包含在此仓库。现有 `.cmd` 启动器保留开发机历史路径，其他电脑请优先使用以上命令。

## 测试

```sh
npm test
npm install
npm run test:full
```

第一项运行核心关键词、口语逻辑和剧情回归，无需额外 npm 包。完整测试依赖开发依赖；浏览器脚本需要先启动界面及适用的服务，部分历史脚本保留 Windows Chrome 路径或需要语音模型与测试素材。未包含录音素材、模型和历史测试输出。

## 项目结构

- `outputs/realtime-visual-demo/studio/`：当前产品界面、绘图、字幕与识别适配。
- `outputs/realtime-visual-demo/server.js`：本地网页与 API 代理。
- `work/studio-tests/`：回归测试与历史验证脚本。
- `work/generate-gossip-narration.ps1`：Windows 系统语音生成示例音频的脚本。

保留原有目录布局以维持本地服务的数据路径。运行数据会写到被忽略的 `work/local-server-data/`。较早的 README 和实验说明作为历史资料保留，以本文件描述的当前行为为准。

这次仅公开项目源码，不是互联网服务部署。后端绑定本机地址，GitHub Pages 无法直接运行这些 Python/Node 服务。
