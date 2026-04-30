# Model Preset Sources

This file records where Copilot Bro model presets should be checked during future updates.

## Provider Documentation

- DeepSeek: https://api-docs.deepseek.com/zh-cn/
- Zhipu / Z.AI: https://docs.bigmodel.cn/cn/api/introduction
- MiniMax: https://platform.minimax.io/docs/api-reference/text-openai-api
- Kimi / Moonshot: https://platform.kimi.ai/docs/models
- Qwen / DashScope: https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope

## Reference Extensions

- Vizards DeepSeek V4 provider: https://github.com/Vizards/deepseek-v4-for-copilot
- MiniMax VS Code provider: https://github.com/zelosleone/minimax-vscode
- GLM provider: https://github.com/zelosleone/glm-chat-provider
- Z.AI provider: https://github.com/Ryosuke-Asano/zai-provider-extension
- Qwen Copilot provider: https://github.com/zelosleone/Qwen-Copilot
- Kimi Copilot provider: https://github.com/zelosleone/kimi-lm-copilot-provider

## Current Notes

- DeepSeek V4 presets use a 1,048,576 token context window. The default output budget stays at 32,768 tokens for practical Agent reliability and cost control, while the UI hint allows the larger provider range up to 393,216.
- MiniMax M2 presets use `reasoning_split: true` so reasoning can be parsed separately from visible content.
- Kimi thinking requests use `thinking: { type: "enabled", keep: "all" }` when thinking is enabled.
