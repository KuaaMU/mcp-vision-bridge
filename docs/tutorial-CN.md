# 让纯文本编码 agent 拥有眼睛——5 分钟搞定

DeepSeek V4 Flash 写代码很厉害。但它看不到你刚粘贴的错误对话框、坏掉的
UI、或者那个渲染 bug 的截图。它只会回你一句"我看不到图片"，然后你又得
手动把报错抄一遍。日复一日。

**mcp-vision-bridge** 解决的就是这个。它是一个极小的 MCP server，把图片
路由到你大概率已经在付费的多模态模型（mimo、Claude、Gemini、GPT-4o、
Qwen-VL）上，从而给任何纯文本编码 agent 加上视觉。一个工具：`analyze_image`。

```text
你（粘贴一张报错截图）
    ↓
Agent（纯文本，调用 analyze_image）
    ↓
mcp-vision-bridge（转发图片字节）
    ↓
你的视觉模型（mimo / Claude / Gemini / GPT-4o）
    ↓
Agent 现在能基于完整文字描述来推理
```

图片永远不会进入 agent 的上下文。桥只负责读像素，你的视觉模型负责"看"，
返回的是纯文本。

## 和别的 vision MCP 有什么不同

MCP 视觉 server 不少，但多数要你托管一个服务器去连。这个不一样——**本地、
一条命令、零配置**：

- **跨所有 agent 通用** —— Claude Code、Codex、opencode、Kimi、PI、
  Cursor、Reasonix。一个 server，任何 MCP 客户端。
- **拖进来就行**。把图片文件拖进对话 → prompt 里出现真实路径 →
  `analyze_image` 直接读。无剪贴板，无粘贴怪癖。
- **自动发现**。`image="recent"` / `image="session"` 会自动找到你在
  Claude Code、Codex、opencode、Cowork、Reasonix、Grok 里粘贴的图片——
  不用手打路径。
- **一次调用多张**。贴 3 张截图问一个问题。hook 读取你的会话 transcript，
  把全部图片一次性发给模型，每张图独立 token 预算。
- **严格当前会话**。`recent`/`session` 绝不泄露别的会话的图片——隐私和多开
  都安全。
- **自动更新**。每次 server 启动都把 skill + hook 自动同步到 `~/.claude/`，
  所以 `npx -y mcp-vision-bridge` 永远跑最新版。

## 安装——选你的 agent

**Claude Code（插件，一条命令）：**
```bash
claude plugin marketplace add KuaaMU/agent-plugins
claude plugin install mcp-vision-bridge
```

**其他（Codex、opencode、Kimi、PI…）：**
```bash
git clone https://github.com/KuaaMU/mcp-vision-bridge && cd mcp-vision-bridge
./install.sh            # 自动检测你的 agent
```

**手动（任何 MCP 客户端）：**
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

需要 Node.js ≥ 18。

## 使用

1. 装完后**重启 agent**。
2. **把图片文件拖进对话**（或 Claude Code / Cowork 里 Ctrl+V）。
3. 说 **"看看这个"** / **"analyze this"** / **"what's the error?"**。

你的 agent 会调用 `analyze_image`，拿回一份它可以直接用来调试的详细文字描述
——逐字文本、布局、颜色、异常。

一次贴了好几张？hook 会在会话 transcript 里检测到，引导 agent 调用
`analyze_image(image="session")` —— 全部图片、一次调用。

## 一个工具，诚实说明它是什么

`analyze_image(image, prompt, task, detail, save_to)` 接受路径、URL、
`"clipboard"`、`"recent"`、`"session"` 或数组。`task` 预设
（`describe | ocr | ui | layout | qa`）**是发给视觉模型的提示词**——没有内置
OCR 引擎，识别由模型完成。把用户的实际问题放进 `prompt`，模型就回答你问的。

## 它不是什么

- 不是视觉模型——它路由到你已经在付费的那个。
- 不是 OCR 引擎——它让多模态模型去读图。
- 不是云服务——它本地运行，你的 key 和图片都留在自己机器上。

MIT 协议。npm：`mcp-vision-bridge`。源码：
[github.com/KuaaMU/mcp-vision-bridge](https://github.com/KuaaMU/mcp-vision-bridge)
⭐ 如果它让你少抄一次报错，一个 star 就能让它被持续维护。
