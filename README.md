# Extended Models for Copilot 🚀

把 DeepSeek、智谱 GLM、Kimi、Qwen 以及任意 OpenAI-compatible 模型接入 VS Code / GitHub Copilot Chat 的模型选择器。

本扩展基于 VS Code `LanguageModelChatProvider` API 工作。它让 Copilot Chat、Edit、Agent 等聊天场景可以选择你自己的模型，但不会替代 Copilot 原生内联补全、仓库索引、意图识别等后台服务。

## ✨ 功能概览

- 🤖 接入 OpenAI-compatible `/chat/completions` 模型。
- 🧩 支持 Copilot Chat / Edit / Agent 模式中的模型选择器。
- 🛠️ 支持 OpenAI function calling，可用于 Agent 工具调用。
- 🖼️ 支持标记为 `vision: true` 的视觉模型输入。
- 🧠 支持 `reasoning_content`、`reasoning`、`thinking` 和 `<think>` 流式思考内容。
- 🔐 API Key 仅保存在本机 VS Code `SecretStorage`，不会写入 `settings.json`、导出文件或日志。
- 🧯 支持超时、取消、限流和常见 5xx 错误重试。
- ⚙️ 提供可视化设置页，可用下拉框和输入框调整常用参数。
- 🧱 保留自定义供应商和自定义模型。

## 📦 内置供应商

扩展内置以下官方 OpenAI-compatible 供应商预设，并会在重启 VS Code 或重载扩展后刷新内置目录：

- DeepSeek：`deepseek-v4-pro`、`deepseek-v4-flash`
- 智谱 / Z.AI：`glm-5.1`
- Kimi / Moonshot：`kimi-k2.6`、`kimi-k2.5`、K2 preview/thinking、Moonshot V1 文本与视觉模型
- Qwen / DashScope：Qwen commercial、coder、QwQ、math、open-source 系列

你在本地保存过的模型参数会作为 override 合并到最新预设上。也就是说，供应商新增模型时你能看到新模型；你改过的温度、输出长度、thinking 等参数不会被覆盖。只有当供应商模型 ID 被替换或删除时，旧模型才会作为你的本地自定义配置继续保留。

## 🚀 快速开始

1. 安装扩展，要求 VS Code `1.104.0` 或更高版本。
2. 打开命令面板，运行 `Extended Models: Open Configuration`。
3. 在设置页中选择供应商和模型，按需调整参数，点击 `Save Local Model Override`。
4. 运行 `Extended Models: Set Provider API Key`。
5. 选择供应商，例如 `deepseek`、`zhipu`、`kimi`、`qwen`。
6. 输入 API Key。供应商名前出现 `✓` 表示本机已保存 key。
7. 打开 Copilot Chat 的模型选择器，进入 `Manage Models`，启用 `Extended Models` 下的模型。
8. 回到聊天框选择模型并开始使用。

> 注意：如果模型没有出现，请用 `--enable-proposed-api local.extended-models-for-copilot` 启动 VS Code。当前 VS Code 模型供应商 API 仍属于 proposed API。

## 🔐 API Key 安全说明

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

## ⚙️ 可视化设置

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

## 🧩 添加自定义供应商和模型

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

## 🧪 本地开发

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
```

`npm run package:vsix` 会自动编译并生成 `.vsix` 安装包。

## 🛠️ 本地安装 VSIX

```bash
code --install-extension extended-models-for-copilot-0.1.0.vsix --force
code . --enable-proposed-api local.extended-models-for-copilot
```

## 📤 发布到 VS Code Marketplace

发布前需要：

- 一个 Azure DevOps / Visual Studio Marketplace publisher。
- 一个可发布扩展的 Personal Access Token。
- 将 `package.json` 中的 `publisher` 从 `local` 改为你的真实 publisher。

然后运行：

```bash
npm run publish:marketplace
```

## 📄 License

MIT License. See [LICENSE](LICENSE).
