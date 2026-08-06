<div align="center">

# 👁️ mcp-vision-bridge

**让纯文本编码智能体拥有眼睛。**

DeepSeek V4 Flash 写代码很厉害——但它看不到你粘贴的错误对话框、坏掉的 UI 或截图。这个 MCP server 通过你选择的多模态模型给任何纯文本 agent 赋予视觉能力。

支持 **Claude Code · Codex · opencode · Kimi · PI · Cursor** 以及任何 MCP 客户端。

[English](README.md) · [中文](README-CN.md)

<img src="docs/demo/codex-gui-test.png" alt="在 Codex GUI 里粘贴两张图 —— agent 正确识别两者" width="700"/>

</div>

---

## 为什么需要它

你的 agent 看不见。你粘贴截图 → *"我看不到图片。"* 你只能手动抄写错误信息。有了它，agent 调用一个工具就能拿到完整的文字描述——逐字文本、布局、颜色、异常——然后进行调试、修复和解释。

> **它不是视觉模型。** 它是座桥：把图片发给一个你已经在付费的多模态模型（mimo、Claude、Gemini、GPT-4o、Qwen-VL…）并返回详细描述。图片永远不会进入你 agent 的上下文。

---

## 🚀 安装（选你的 agent——这就是全部配置）

<img src="docs/install-decision.svg" alt="选择哪种安装方式" width="900"/>

### Claude Code（一条命令）

```bash
claude plugin marketplace add KuaaMU/agent-plugins
claude plugin install mcp-vision-bridge
```

就这些——插件捆绑了 **MCP server + vision skill + auto-loop hook**。Claude Code 会提示你配置一次视觉端点、API key 和模型。

> 想用 **cc-switch** 管理（能看到它 + 同步到 Codex/opencode/Gemini）？用下面的安装脚本。

### Codex / Reasonix / opencode / Kimi / 其他（一条命令）

```bash
git clone https://github.com/KuaaMU/mcp-vision-bridge && cd mcp-vision-bridge
./install.sh                     # 自动检测你的 agent
```

如果无法自动检测，手动指定：`./install.sh claude | reasonix | codex | opencode | kimi`。会问你三个值：**endpoint（端点）**、**key（密钥）**、**model（模型）**。

**Reasonix** 读取和 Claude Code 相同的 `.mcp.json`，所以 `./install.sh reasonix`
（或手动加一个含 `vision` server 的 `.mcp.json`）即可——粘贴的图片落在
`.reasonix/attachments/`，`image="recent"` 能自动找到。

### 手动（不用安装脚本）

在你的 agent 里加一个 stdio MCP server：

```json
{
  "command": "npx",
  "args": ["-y", "mcp-vision-bridge"],
  "env": {
    "VISION_OPENAI_BASE_URL": "https://your-endpoint/v1",
    "VISION_OPENAI_API_KEY": "sk-your-key",
    "VISION_MODEL": "your-vision-model"
  }
}
```

需要 **Node.js ≥ 18**。

---

## 🎯 使用

安装后，**重启你的 agent**，然后：

<img src="docs/usage-flow.svg" alt="如何使用：截图 → 复制 → 提问 → 完成" width="900"/>

**最佳方式——把图片文件拖进对话。** 向任何 agent（TUI 或 GUI）拖入一个图片文件，都会插入它的真实路径，`analyze_image` 直接接受——在 Claude Code、Cowork、Codex、opencode、PI 等所有环境里行为一致。无剪贴板，无粘贴怪癖。

1. **把图片文件拖进输入框**（或 Claude Code / Cowork 里 Ctrl+V）
2. 说 **"看看这个"**（或 "analyze this"、"what's the error?"）
3. 你的 agent 调用 `analyze_image` → 视觉模型详细描述它

一次贴 3 张？hook 读取你的会话 transcript（无损、多图）。`image="recent"`
自动在 **Claude Code CLI、Reasonix、Cowork、Codex** 里找到粘贴的图——无需剪贴板。
如果桌面 GUI 没有注册粘贴（可能静默失败），直接**拖文件进来**——路径永远有效。

### 唯一的工具

> Agent 文档 → [**README_AGENT.md**](README_AGENT.md)（工具契约、来源选择、错误处理）。

```
analyze_image(
  image   = "path | URL | clipboard | recent | session | data:URI",  // 单个，或
             ["path","path",...]                                      // 一次多张
  task    = "describe | ocr | ui | layout | qa",   // 或用 prompt:
  prompt  = "What error is on screen?",
  detail  = "high" | "low",
  save_to = "optional file for long output"
)
```

- **`image`** — 本地路径、http(s) URL、`"clipboard"`、`"recent"`（本会话最近一张）、`"session"`（**本会话全部图片，一次分析**）、base64 data URI，或**数组**一次分析多张（如"对比这两张"）。
- **`task`** — 常见任务；`ocr` 提取文字，`ui` 描述界面，等等
- **`prompt`** — 自由提问（覆盖 `task`）。**把用户的实际问题放这里**——视觉模型会回答你问的，所以一个具体问题（"屏幕上显示什么错误？"）比通用的 `describe` 更准

### 粘贴的图片如何被发现

向编码 agent 粘贴图片会把它存在某处。`image="recent"` / `"session"` 自动找到它——无需剪贴板，无需手动路径：

| Agent | 粘贴图片落在哪 | 自动发现？ |
|---|---|---|
| Claude Code CLI/TUI | `~/.claude/image-cache/<uuid>/N.png`（用 **Alt+V** 粘贴） | ✅ |
| Reasonix | `~/.reasonix/sessions/` + 项目 `.reasonix/attachments/` | ✅ |
| opencode | `~/.local/share/opencode/opencode.db`（SQLite `part` 表，Node ≥ 22.5） | ✅ |
| Cowork（Claude-3p 桌面版） | `%LOCALAPPDATA%\Claude-3p\...\uploads\*_image.png` | ✅ |
| Codex | `~/.codex/attachments/<session>/image-*.png` | ✅ |
| Grok Build | `~/.grok/sessions/*/*/images/` | ✅ |

> **Windows 剪贴板真相：** 在资源管理器里"复制文件"（Ctrl+C）放到剪贴板的是一个*文件列表*——不是图片字节。所以向 CLI 粘贴本地图片，只有当你复制的是图片*内容*（截图工具、浏览器"复制图片"）才有效。否则直接粘贴文件路径——`analyze_image` 直接读取它。

---

## 演示（mimo-v2.5）

`analyze_image` → describe/ocr → 详细文本。同一个工具支持任何视觉模型。

**Codex GUI 实测**（上图）：粘贴两张图，agent 正确识别两者——Codex 欢迎界面和一张 Chris Griffin 插画。自动发现定位到 `~/.codex/attachments/`，无需手动输入路径。

**OCR 一张截图** → 逐行复现，包括菜单栏 `文件(F) 编辑(E) 格式(O) 查看(V) 帮助(H)` 和全部正文，按阅读顺序。

**描述一张图** → 元素、空间布局、颜色、任何异常，一一列举。

---

## 架构

<img src="docs/architecture.svg" alt="项目架构：MCP 工具 + skill + hook" width="900"/>

为纯文本 agent 闭合环路的三个部分：

- **MCP 工具**（`analyze_image`）— 能力。把像素发给你的视觉模型，返回文字。
- **Skill**（`skills/vision/`）— 指导。告诉 agent *何时*和*如何*调用它。
- **Hook**（`UserPromptSubmit`）— 自动化。从会话 transcript 捕获粘贴的图片并替你触发调用。

用插件（Claude Code）或 `install.sh`（任何 agent）全部安装。

---

## 工作原理

<img src="docs/flow.svg" alt="工作原理：agent → 桥 → 视觉模型 → 文本" width="900"/>

纯文本进，纯文本出。server 从不解释图片——它取到字节，让你的视觉模型去看。

---

## 配置

全部通过环境变量（MCP 从你 agent 的 server 配置里读取）。

| 变量 | 何时用 | 示例 |
|---|---|---|
| `VISION_OPENAI_BASE_URL` | OpenAI 兼容 | `https://opencode.ai/zen/go/v1` |
| `VISION_OPENAI_API_KEY` | OpenAI 兼容 | `sk-...` |
| `VISION_MODEL` | 总是 | `mimo-v2.5`、`gpt-4o`、`qwen-vl-max` |
| `VISION_PROVIDER` | 非 openai | `anthropic` \| `gemini` |
| `VISION_ANTHROPIC_API_KEY` | anthropic | `sk-ant-...` |
| `VISION_GEMINI_API_KEY` | gemini | `AIza...` |
| `VISION_MAX_TOKENS` | 可选 | `2048` 每张图——**多图时自动 ×N 放大**（上限 12000），避免多图描述被截断 |
| `VISION_TIMEOUT_MS` | 可选 | `30000` |
| `VISION_BLOCK_PRIVATE_URLS` | 可选 | `true` 阻止 localhost 抓取 |

---

## 开发

```bash
npm install
npm run build          # tsc → dist/
npm test               # vitest
npm run test:e2e       # 针对 mock provider 的 stdio 流水线
```

结构：`src/`（server）、`skills/vision/`（skill）、`hooks/`（auto-loop hook）、
`install.sh`（安装器）、`examples/`（各 agent 模板）。

---

## 安全

- 密钥只存在 env/config 里——绝不会出现在工具参数中。
- URL 来源有可选的 SSRF 防护。
- 图片只发给你配置的视觉 provider。

## License

[MIT](LICENSE)

---

<div align="center">

**DeepSeek 写代码，`mcp-vision-bridge` 读屏幕。**

[GitHub](https://github.com/KuaaMU/mcp-vision-bridge) · [npm](https://www.npmjs.com/package/mcp-vision-bridge) · [Plugins](https://github.com/KuaaMU/agent-plugins) · ⭐ 有用的话给个星

</div>
