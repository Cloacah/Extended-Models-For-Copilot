# Extended Models for Copilot 🚀

**语言 / Language： [中文](#中文) | [English](#english)**

## 中文

把 DeepSeek、智谱 GLM、Kimi、Qwen 以及任意 OpenAI-compatible 模型接入 VS Code / GitHub Copilot Chat 的模型选择器。

本扩展基于 VS Code `LanguageModelChatProvider` API 工作。它让 Copilot Chat、Edit、Agent 等聊天场景可以选择你自己的模型，但不会替代 Copilot 原生内联补全、仓库索引、意图识别等后台服务。

### ✨ 功能概览

- 🤖 接入 OpenAI-compatible `/chat/completions` 模型。
- 🧩 支持 Copilot Chat / Edit / Agent 模式中的模型选择器。
- 🛠️ 支持 OpenAI function calling，可用于 Agent 工具调用。
- 🖼️ 支持标记为 `vision: true` 的视觉模型输入。
- 🧠 支持 `reasoning_content`、`reasoning`、`thinking` 和 `<think>` 流式思考内容。
- 🔐 API Key 仅保存在本机 VS Code `SecretStorage`，不会写入 `settings.json`、导出文件或日志。
- 🧯 支持超时、取消、限流和常见 5xx 错误重试。
- ⚙️ 提供可视化设置页，可用下拉框和输入框调整常用参数。
- 🧱 保留自定义供应商和自定义模型。

### 📦 内置供应商

扩展内置以下官方 OpenAI-compatible 供应商预设，并会在重启 VS Code 或重载扩展后刷新内置目录：

- DeepSeek：`deepseek-v4-pro`、`deepseek-v4-flash`
- 智谱 / Z.AI：`glm-5.1`
- Kimi / Moonshot：`kimi-k2.6`、`kimi-k2.5`、K2 preview/thinking、Moonshot V1 文本与视觉模型
- Qwen / DashScope：Qwen commercial、coder、QwQ、math、open-source 系列

你在本地保存过的模型参数会作为 override 合并到最新预设上。也就是说，供应商新增模型时你能看到新模型；你改过的温度、输出长度、thinking 等参数不会被覆盖。只有当供应商模型 ID 被替换或删除时，旧模型才会作为你的本地自定义配置继续保留。

### 🚀 快速开始

1. 安装扩展，要求 VS Code `1.104.0` 或更高版本。
2. 打开命令面板，运行 `Extended Models: Open Configuration`。
3. 在设置页中选择供应商和模型，按需调整参数，点击 `Save Local Model Override`。
4. 运行 `Extended Models: Set Provider API Key`。
5. 选择供应商，例如 `deepseek`、`zhipu`、`kimi`、`qwen`。
6. 输入 API Key。供应商名前出现 `✓` 表示本机已保存 key。
7. 打开 Copilot Chat 的模型选择器，进入 `Manage Models`，启用 `Extended Models` 下的模型。
8. 回到聊天框选择模型并开始使用。

> 注意：如果模型没有出现，请用 `--enable-proposed-api local.extended-models-for-copilot` 启动 VS Code。当前 VS Code 模型供应商 API 仍属于 proposed API。

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

建议不要把 API Key 写进模型的 `headers` 或 `extraBody`。如果误写，扩展会尽量过滤，但最安全的方式始终是使用 `Extended Models: Set Provider API Key`。

### ⚙️ 可视化设置

运行 `Extended Models: Open Configuration` 可以打开图形化设置页：

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
- Tool Calling / Agent：是否声明支持工具调用。

点击 `Save Local Model Override` 会把当前参数保存到 `extendedModels.models`。API Key 不会保存在这里。

### 🧩 添加自定义供应商和模型

在设置页的 `Add Custom Provider / Model` 区域填写：

- Provider Key：例如 `my-provider`
- Model ID：例如 `my-model`
- Display Name：显示名称
- Base URL：例如 `https://example.com/v1`
- Context Length：上下文长度
- Max Output Tokens：最大输出
- Vision Input：是否支持图片
- Tool Calling / Agent：是否支持工具

保存后运行 `Extended Models: Set Provider API Key`，选择你的自定义 provider 并输入 key。

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

`npm run release:vsix` 会自动打包 VSIX，并用 GitHub CLI 上传到当前版本对应的 GitHub Release，例如 `v0.1.0`。它会读取 `CHANGELOG.md` 中对应版本的说明作为 Release Notes。使用前请先安装并登录 GitHub CLI：

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
code --install-extension extended-models-for-copilot-0.1.0.vsix --force
code . --enable-proposed-api local.extended-models-for-copilot
```

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

Connect DeepSeek, Zhipu GLM, Kimi, Qwen, and any OpenAI-compatible model to the VS Code / GitHub Copilot Chat model picker.

This extension uses VS Code's `LanguageModelChatProvider` API. It supports Copilot Chat, Edit, and Agent chat flows that can select models from the VS Code model picker. It does not replace Copilot native inline completions, repository indexing, intent detection, or other Copilot service features.

### ✨ Features

- 🤖 OpenAI-compatible `/chat/completions` integration.
- 🧩 Works with Copilot Chat, Edit, and Agent model picker flows.
- 🛠️ OpenAI function calling for Agent tool use.
- 🖼️ Vision input for models marked as `vision: true`.
- 🧠 Thinking/reasoning streams from `reasoning_content`, `reasoning`, `thinking`, and XML `<think>` blocks.
- 🔐 API keys are stored only in local VS Code `SecretStorage`.
- 🧯 Retry and timeout handling for common provider/network errors.
- ⚙️ Visual configuration page with dropdowns, tooltips, and common model parameters.
- 🧱 Custom providers and custom models remain supported.

### 📦 Built-In Providers

Built-in presets are refreshed when VS Code or the extension reloads:

- DeepSeek: `deepseek-v4-pro`, `deepseek-v4-flash`
- Zhipu / Z.AI: `glm-5.1`
- Kimi / Moonshot: `kimi-k2.6`, `kimi-k2.5`, K2 preview/thinking models, Moonshot V1 text and vision models
- Qwen / DashScope: commercial, coder, QwQ, math, and open-source Qwen families

Local model overrides are merged on top of the refreshed presets. Your local temperature, output length, thinking, and tool settings are preserved unless you remove them.

### 🚀 Quick Start

1. Install the extension in VS Code `1.104.0` or newer.
2. Run `Extended Models: Open Configuration`.
3. Pick a provider/model, adjust parameters, and click `Save Local Model Override`.
4. Run `Extended Models: Set Provider API Key`.
5. Choose `deepseek`, `zhipu`, `kimi`, `qwen`, or your custom provider.
6. Enter the API key. A `✓` before the provider means a local key exists.
7. Open Copilot Chat, open the model picker, go to `Manage Models`, and enable models from `Extended Models`.
8. Select the model in chat and start using it.

> If models do not appear, start VS Code with `--enable-proposed-api local.extended-models-for-copilot`.

### 🔐 API Key Safety

- API keys are stored only through VS Code `SecretStorage`.
- They are not written to `settings.json`.
- They are not exported.
- They are not logged.
- They are not saved by `Save Local Model Override`.
- Sensitive fields are filtered from settings and exports, including `Authorization`, `apiKey`, `api_key`, `token`, `secret`, `password`, and `cookie`.

Use `Extended Models: Set Provider API Key` instead of putting secrets in `headers` or `extraBody`.

### ⚙️ Visual Configuration

Run `Extended Models: Open Configuration` to edit:

- Provider and model
- Base URL
- Display name
- Temperature
- Top P
- Max output tokens
- Thinking mode
- Reasoning effort
- Vision input
- Tool calling / Agent capability

The page supports Chinese and English, and each option includes a hover tooltip.

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

Then run `Extended Models: Set Provider API Key` and choose your provider.

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
code --install-extension extended-models-for-copilot-0.1.0.vsix --force
code . --enable-proposed-api local.extended-models-for-copilot
```

### 📤 VS Code Marketplace

Marketplace publishing is optional and currently not required. It needs a real Marketplace publisher ID and a VSCE token:

```bash
npm run publish:marketplace
```

### 📄 License

MIT License. See [LICENSE](LICENSE).
