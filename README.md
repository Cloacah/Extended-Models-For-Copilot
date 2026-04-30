# Copilot Bro

**语言 / Language： [中文](#中文) | [English](#english)**

## 中文

把 DeepSeek、智谱 / Z.AI GLM、MiniMax、Kimi、Qwen 以及任意 OpenAI-compatible 模型接入 VS Code / GitHub Copilot Chat 的模型选择器。

本扩展基于 VS Code `LanguageModelChatProvider` API 工作。它让 Copilot Chat、Edit、Agent 等聊天场景可以选择你自己的模型，但不会替代 Copilot 原生内联补全、仓库索引、意图识别等后台服务。

### 功能概览

- 多供应商 BYOK：内置 DeepSeek、Z.AI GLM、MiniMax、Kimi/Moonshot、Qwen/DashScope，并保留自定义供应商和自定义模型。
- Copilot 原生工作流：模型出现在 Copilot Chat 模型选择器中，支持 Chat、Edit、Agent、工具调用、MCP 和工作区上下文。
- Thinking / reasoning：支持 `reasoning_content`、`reasoning_details`、`thinking` 和 `<think>` 流式思考内容，并在多轮工具调用中自动回放或安全裁剪。
- 透明识图代理：文本模型可调用另一个支持图片输入的模型先描述图片，再回到当前模型继续回答，避免把原图塞进当前模型上下文。
- 模型快捷配置：支持在模型选择器可用时显示 temperature 快捷配置；不可用时回退为清晰文本和设置入口。
- 预设提示词：内置和用户自定义 `*.copilot-bro.prompt.md` Markdown 预设，可在请求前作为系统上下文注入。
- 安全默认值：API Key 仅保存在本机 VS Code `SecretStorage`，不会写入 `settings.json`、导出文件或日志。
- 可视化设置：配置页支持中英双语、供应商 key 标记、模型参数下拉、视觉代理、预设提示词和主题自适应按钮。

### 截图示意

- [配置页面截图示意](media/config-panel.svg)
- [识图代理流程示意](media/vision-proxy.svg)

### 📦 内置供应商

扩展内置以下官方 OpenAI-compatible 供应商预设。保存供应商 API Key 后，扩展会尝试调用该供应商的 `/models` 接口刷新远端模型列表；失败时保留内置预设或上次缓存，不影响启动：

- DeepSeek：`deepseek-v4-pro`、`deepseek-v4-flash`
- 智谱 / Z.AI：`glm-5.1`、`glm-5v-turbo`、`glm-4.6v`、`glm-4.5v`、`glm-4.6`、`glm-4.5`、GLM 4 系列
- MiniMax：`MiniMax-M2.7`、`MiniMax-M2.5`、`MiniMax-M2.1`、`MiniMax-M2`
- Kimi / Moonshot：`kimi-k2.6`、`kimi-k2.5`、K2 preview/thinking、Moonshot V1 文本与视觉模型
- Qwen / DashScope：Qwen commercial、coder、QwQ、math、open-source 系列

你在本地保存过的模型参数会作为 override 合并到最新预设或远端模型列表上。也就是说，供应商新增模型时你能看到新模型；你改过的温度、输出长度、thinking 等参数不会被覆盖。只有当供应商模型 ID 被替换或删除时，旧模型才会作为你的本地自定义配置继续保留。

### 🚀 快速开始

1. 安装扩展，要求 VS Code `1.104.0` 或更高版本。
2. 打开命令面板，运行 `Copilot Bro: Open Model Settings`。
3. 在设置页中选择供应商和模型，按需调整参数，点击 `Save Local Model Override`。
4. 运行 `Copilot Bro: Set Provider API Key`。
5. 选择供应商，例如 `deepseek`、`zhipu`、`kimi`、`qwen`。
6. 输入 API Key。供应商名前出现 `✓` 表示本机已保存 key。
7. 打开 Copilot Chat 的模型选择器，进入 `Manage Models`，启用 `Copilot Bro` 下的模型。
8. 回到聊天框选择模型并开始使用。

> 本扩展使用 VS Code `1.104.0` 起可用的稳定 `LanguageModelChatProvider` API，不再需要 `--enable-proposed-api`。
> 在稳定 API 下，扩展无法完全复用 Copilot 内置模型的官方 thinking UI。本扩展会优先使用可用的 VS Code thinking part；不可用时会把 DeepSeek reasoning 渲染为可折叠 Markdown 思考块，并附带隐藏元数据，以便下一轮请求还原 DeepSeek 要求的 `reasoning_content`。这些展示块会在发送给模型前自动移除，不会作为普通 assistant 内容污染上下文。
> VS Code/Copilot 当前存在第三方 `LanguageModelChatProvider` 的原生“上下文窗口”用量显示为 0% 的限制。扩展仍会正确提供 `maxInputTokens` 和 `provideTokenCount` 供预算与自动压缩使用，并在状态栏显示自己的 token 用量估算/实际 usage。

### 🔐 API Key 安全说明

API Key 的处理规则如下：

- 只通过 VS Code `SecretStorage` 存储在本机。
- 不写入 `settings.json`。
- 不写入导出的模型配置。
- 不写入日志或 OutputChannel。
- 不会被 `Save Local Model Override` 保存。
- 不会被 `Export Model Configuration` 导出。
- 设置中的敏感字段会被过滤，例如 `Authorization`、`apiKey`、`api_key`、`token`、`secret`、`password`、`cookie`。
- 日志输出会自动脱敏敏感字段。

建议不要把 API Key 写进模型的 `headers` 或 `extraBody`。如果误写，扩展会尽量过滤，但最安全的方式始终是使用 `Copilot Bro: Set Provider API Key`。

### ⚙️ 可视化设置

运行 `Copilot Bro: Open Model Settings` 可以打开图形化设置页，也可以在 VS Code 设置中搜索 `Copilot Bro`，点击显式入口直达。

- Provider：选择供应商。
- Model：选择模型。
- Base URL：模型服务地址。
- Display Name：模型在选择器里的显示名称。
- Temperature：采样温度。
- Top P：核采样参数。
- Max Output Tokens：最大输出 token。
- Thinking：开启或关闭模型思考模式。
- Reasoning Effort：推理强度。
- Vision Input：是否启用图片输入。
- Model Vision Proxy：为当前模型指定另一个视觉模型作为图片描述代理。
- Tool Calling / Agent：是否声明支持工具调用。

点击 `Save Local Model Override` 会把当前参数保存到 `extendedModels.models`，并保持当前供应商/模型选择和滚动位置。API Key 不会保存在这里。

### 🧩 添加自定义供应商和模型

在设置页的 `Add Custom Provider / Model` 区域填写：

- Provider Key：例如 `my-provider`
- Model ID：例如 `my-model`
- Display Name：显示名称
- Base URL：例如 `https://example.com/v1`
- Context Length：上下文长度
- Max Output Tokens：最大输出
- Temperature / Top P：采样参数
- Thinking / Reasoning Effort：思考模式和推理强度
- Vision Input：是否支持图片
- Tool Calling / Agent：是否支持工具

保存后运行 `Copilot Bro: Set Provider API Key`，选择你的自定义 provider 并输入 key。

### 识图代理

全局识图代理位于配置页的 `Vision Proxy` 区域，也可在 `extendedModels.visionProxy` 中手动配置。留空 `defaultModelId` 时，扩展会自动选择已安装且支持 `imageInput` 的内置 Copilot 视觉模型。模型级 `visionProxyModelId` 优先于全局默认；填 `null` 可禁用某个模型的代理。

识图代理只把图片描述文本传给当前模型。当前模型完成回答后仍然是你选择的模型，不会永久切换到视觉模型。

### 预设提示词

运行 `Copilot Bro: Select Prompt Preset` 选择预设。文件格式为 Markdown，后缀为 `*.copilot-bro.prompt.md`：

- 内置预设随扩展更新。
- 全局预设可通过 `Copilot Bro: Open Global Prompt Preset Folder` 打开目录后添加。
- 工作区预设放在 `.copilot-bro/prompts/*.copilot-bro.prompt.md`。

该后缀刻意不同于 VS Code 原生 `.prompt.md`、Cursor rules 和 `AGENTS.md`，避免互相抢占语义。

也可以手动写入 `settings.json`：

```json
{
	"extendedModels.models": [
		{
			"id": "my-model",
			"displayName": "My Model",
			"provider": "my-provider",
			"baseUrl": "https://example.com/v1",
			"contextLength": 128000,
			"maxOutputTokens": 4096,
			"toolCalling": true,
			"vision": false,
			"temperature": 0
		}
	]
}
```

### 🧪 本地开发

安装依赖：

```bash
npm install
```

常用命令：

```bash
npm run compile
npm run lint
npm test
npm run package:vsix
npm run release:vsix
```

`npm run package:vsix` 会自动编译并生成 `.vsix` 安装包。

`npm run release:vsix` 会自动打包 VSIX，并用 GitHub CLI 上传到当前版本对应的 GitHub Release，例如 `v0.1.4`。它会读取 `CHANGELOG.md` 中对应版本的说明作为 Release Notes。使用前请先安装并登录 GitHub CLI：

```bash
gh auth login
```

**若刚登录成功，过一会又提示未登录 / `The token in keyring is invalid` / HTTP 401：**

1. **先查环境变量（最常见）**  
   CI 工具、`.bashrc`、PowerShell Profile、系统「环境变量」、Cursor 的终端集成设置里，可能设置了 **`GITHUB_TOKEN` 或 `GH_TOKEN`**。若值为过期或错误的 PAT，`gh` 会**优先用它**而不是 keyring，表现为「时而能用时而 401」。  
   在出问题的终端执行：`echo "$GITHUB_TOKEN"`、`echo "$GH_TOKEN"`（PowerShell：`echo $env:GITHUB_TOKEN`）。若非空且你已改用浏览器登录，请从各处配置里**删除或改正**该变量，新开终端再执行 `gh auth status`。
2. **刷新 OAuth 会话**：`gh auth refresh -h github.com`
3. **清理 Windows 凭据管理器**中旧的 `git:https://github.com` / `github.com` 条目后，再执行 `gh auth login`。
4. **需要长期稳定自动化**时：在 GitHub 创建**不过期或长有效期**的 PAT，仅用 `GH_TOKEN`（或 `echo pat | gh auth login --with-token`），并**不要**再在别处保留一份冲突的旧 `GITHUB_TOKEN`。

### 🛠️ 本地安装 VSIX

```bash
code --install-extension copilot-bro-0.1.6.vsix --force
```

安装后直接重载 VS Code 或运行 `Developer: Reload Window` 即可使用。若旧版本仍看到 `CANNOT USE these API proposals`，请确认安装的是重新打包后的 VSIX，并卸载旧版后再安装。

### 📤 发布到 VS Code Marketplace

发布前需要：

- 一个 Azure DevOps / Visual Studio Marketplace publisher。
- 一个可发布扩展的 Personal Access Token。
- 将 `package.json` 中的 `publisher` 从 `local` 改为你的真实 publisher。

然后运行：

```bash
npm run publish:marketplace
```

### 📄 License

MIT License. See [LICENSE](LICENSE).

## English

Connect DeepSeek, Zhipu / Z.AI GLM, MiniMax, Kimi, Qwen, and any OpenAI-compatible model to the VS Code / GitHub Copilot Chat model picker.

This extension uses VS Code's `LanguageModelChatProvider` API. It supports Copilot Chat, Edit, and Agent chat flows that can select models from the VS Code model picker. It does not replace Copilot native inline completions, repository indexing, intent detection, or other Copilot service features.

### Features

- Multi-provider BYOK for DeepSeek, Z.AI GLM, MiniMax, Kimi/Moonshot, Qwen/DashScope, plus custom OpenAI-compatible providers.
- Native Copilot workflow: models appear in the Copilot Chat model picker and work with Chat, Edit, Agent, tools, MCP, and workspace context.
- Thinking/reasoning support for `reasoning_content`, `reasoning_details`, `thinking`, and `<think>` streams with replay or safe degradation across tool turns.
- Transparent vision proxy: text-only models can ask another image-capable model to describe images, then continue with the selected model.
- Model picker quick configuration for temperature when the host supports it, with text-only fallback and a direct settings command otherwise.
- Markdown prompt presets using the unique `*.copilot-bro.prompt.md` suffix.
- Local-only API keys through VS Code `SecretStorage`.
- Theme-aware visual settings UI with provider key markers, parameter dropdowns, vision proxy, prompt presets, and Chinese/English labels.

### Screenshots

- [Configuration panel screenshot mockup](media/config-panel.svg)
- [Vision proxy flow mockup](media/vision-proxy.svg)

### 📦 Built-In Providers

The extension ships built-in presets and tries to refresh provider model lists from each provider's `/models` endpoint after an API key is saved. If refresh fails, built-in presets or the last cache remain available:

- DeepSeek: `deepseek-v4-pro`, `deepseek-v4-flash`
- Zhipu / Z.AI: `glm-5.1`, `glm-5v-turbo`, `glm-4.6v`, `glm-4.5v`, `glm-4.6`, `glm-4.5`, and GLM 4 variants
- MiniMax: `MiniMax-M2.7`, `MiniMax-M2.5`, `MiniMax-M2.1`, `MiniMax-M2`
- Kimi / Moonshot: `kimi-k2.6`, `kimi-k2.5`, K2 preview/thinking models, Moonshot V1 text and vision models
- Qwen / DashScope: commercial, coder, QwQ, math, and open-source Qwen families

Local model overrides are merged on top of the refreshed presets or remote model list. Your local temperature, output length, thinking, and tool settings are preserved unless you remove them.

### 🚀 Quick Start

1. Install the extension in VS Code `1.104.0` or newer.
2. Run `Copilot Bro: Open Model Settings`.
3. Pick a provider/model, adjust parameters, and click `Save Local Model Override`.
4. Run `Copilot Bro: Set Provider API Key`.
5. Choose `deepseek`, `zhipu`, `kimi`, `qwen`, or your custom provider.
6. Enter the API key. A `✓` before the provider means a local key exists.
7. Open Copilot Chat, open the model picker, go to `Manage Models`, and enable models from `Copilot Bro`.
8. Select the model in chat and start using it.

> This extension uses the stable `LanguageModelChatProvider` API available in VS Code `1.104.0+`; `--enable-proposed-api` is no longer required.
> With the stable API, extensions cannot fully reuse the official thinking UI used by built-in Copilot models. This extension prefers VS Code thinking parts when available; otherwise it renders DeepSeek reasoning as collapsible Markdown thinking blocks with hidden replay metadata, then removes those blocks before sending history back to the provider so the required `reasoning_content` is restored without polluting normal assistant content.
> VS Code/Copilot currently has a limitation where the native context window usage can show 0% for third-party `LanguageModelChatProvider`s. The extension still reports `maxInputTokens` and `provideTokenCount` for budgeting and compaction, and shows its own token estimate/usage in the status bar.

### 🔐 API Key Safety

- API keys are stored only through VS Code `SecretStorage`.
- They are not written to `settings.json`.
- They are not exported.
- They are not logged.
- They are not saved by `Save Local Model Override`.
- Sensitive fields are filtered from settings and exports, including `Authorization`, `apiKey`, `api_key`, `token`, `secret`, `password`, and `cookie`.

Use `Copilot Bro: Set Provider API Key` instead of putting secrets in `headers` or `extraBody`.

### ⚙️ Visual Configuration

Run `Copilot Bro: Open Model Settings` to edit, or search `Copilot Bro` in VS Code Settings and use the direct entry:

- Provider and model
- Base URL
- Display name
- Temperature
- Top P
- Max output tokens
- Thinking mode
- Reasoning effort
- Vision input
- Model-level vision proxy
- Tool calling / Agent capability

The page supports Chinese and English, each option includes a hover tooltip, and saving a model override preserves the current provider/model selection and scroll position.

### 🧩 Custom Providers and Models

Use the `Add Custom Provider / Model` section in the configuration page, or add models to `settings.json`:

```json
{
	"extendedModels.models": [
		{
			"id": "my-model",
			"displayName": "My Model",
			"provider": "my-provider",
			"baseUrl": "https://example.com/v1",
			"contextLength": 128000,
			"maxOutputTokens": 4096,
			"toolCalling": true,
			"vision": false
		}
	]
}
```

Then run `Copilot Bro: Set Provider API Key` and choose your provider.

### Vision Proxy

Configure the global proxy in the `Vision Proxy` section or `extendedModels.visionProxy`. Leave `defaultModelId` empty to auto-pick an installed Copilot model with `imageInput`. A model-level `visionProxyModelId` overrides the global default; `null` disables proxying for that model.

The image itself is sent only to the proxy model. The selected model receives text descriptions and remains the active model for the answer.

### Prompt Presets

Run `Copilot Bro: Select Prompt Preset` to choose a Markdown preset:

- Built-in presets ship with extension updates.
- Global presets live in the folder opened by `Copilot Bro: Open Global Prompt Preset Folder`.
- Workspace presets live in `.copilot-bro/prompts/*.copilot-bro.prompt.md`.

The suffix is intentionally different from VS Code `.prompt.md`, Cursor rules, and `AGENTS.md`.

### 🧪 Development

```bash
npm install
npm run compile
npm run lint
npm test
npm run package:vsix
npm run release:vsix
```

`npm run release:vsix` packages the extension and uploads the VSIX to the GitHub Release for the current version tag, using `CHANGELOG.md` as release notes. It requires GitHub CLI:

```bash
gh auth login
```

**If login works briefly then fails (`token in keyring is invalid`, HTTP 401):**

1. **Check env vars first (most common):** A stale **`GITHUB_TOKEN` or `GH_TOKEN`** (shell profile, system env, CI, Cursor terminal env) takes precedence over the keyring and breaks API calls. Run `echo $GITHUB_TOKEN` / `echo $GH_TOKEN` (PowerShell: `$env:GH_TOKEN`). Remove or fix it everywhere, open a new terminal, then `gh auth status`.
2. **Refresh OAuth:** `gh auth refresh -h github.com`
3. **Windows Credential Manager:** delete old `github.com` / `git:https://github.com` entries, then `gh auth login` again.
4. **Stable automation:** use a long-lived PAT via `GH_TOKEN` only, and remove conflicting copies of the token from other env sources.

### 🛠️ Local VSIX Install

```bash
code --install-extension copilot-bro-0.1.6.vsix --force
```

Reload VS Code after installation. If an older build still reports `CANNOT USE these API proposals`, uninstall it and install the newly packaged VSIX.

### 📤 VS Code Marketplace

Marketplace publishing is optional and currently not required. It needs a real Marketplace publisher ID and a VSCE token:

```bash
npm run publish:marketplace
```

### 📄 License

MIT License. See [LICENSE](LICENSE).
