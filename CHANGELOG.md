# Changelog

All notable changes to this project are documented here.

## [0.1.0] - 2026-04-28

### Added

- Initial VS Code language model provider for Copilot Chat.
- OpenAI-compatible `/chat/completions` streaming support.
- Built-in model presets for DeepSeek, Zhipu / Z.AI, Kimi / Moonshot, and Qwen / DashScope.
- Tool calling support for Agent workflows.
- Vision input support for compatible models.
- Thinking and reasoning stream support for `reasoning_content`, `reasoning`, `thinking`, and XML `<think>` blocks.
- Visual configuration page with local model overrides and custom provider/model creation.
- Local-only API key storage through VS Code `SecretStorage`.
- Sensitive setting filtering and redacted diagnostics.
- Automatic VSIX packaging script.
- GitHub Release upload script via GitHub CLI.

### Security

- API keys are never written to `settings.json`, exported model configuration, README examples, or logs.
- Sensitive fields such as `Authorization`, `apiKey`, `api_key`, `token`, `secret`, `password`, and `cookie` are filtered from model settings and exports.
