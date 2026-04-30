import type { ModelConfig, ModelParameterHints } from "../types";

export const DEFAULT_CONTEXT_LENGTH = 128000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

const EDIT_TOOLS = ["apply-patch", "multi-find-replace", "find-replace"];

const COMMON_HINTS: ModelParameterHints = {
	temperature: { min: 0, max: 2, step: 0.1, recommended: 1 },
	topP: { min: 0, max: 1, step: 0.05, recommended: 1 },
	maxOutputTokens: { min: 1, max: 128000, step: 1024, recommended: 8192 },
	thinking: { options: ["enabled", "disabled"], recommended: "disabled" }
};

const DEEPSEEK_HINTS: ModelParameterHints = {
	...COMMON_HINTS,
	temperature: { min: 0, max: 2, step: 0.1, recommended: 1 },
	maxOutputTokens: { min: 1, max: 393216, step: 1024, recommended: 32768 },
	reasoningEffort: { options: ["high", "max"], recommended: "max" },
	thinking: { options: ["enabled", "disabled"], recommended: "enabled" }
};

const ZHIPU_REASONING_HINTS: ModelParameterHints = {
	...COMMON_HINTS,
	temperature: { min: 0, max: 2, step: 0.1, recommended: 0.6 },
	topP: { min: 0, max: 1, step: 0.05, recommended: 1 },
	maxOutputTokens: { min: 1, max: 128000, step: 1024, recommended: 8192 },
	thinking: { options: ["enabled", "disabled"], recommended: "enabled" }
};

const KIMI_K26_HINTS: ModelParameterHints = {
	...COMMON_HINTS,
	temperature: { min: 0.6, max: 1, step: 0.4, recommended: 1 },
	topP: { min: 0.95, max: 0.95, step: 0, recommended: 0.95 },
	maxOutputTokens: { min: 1, max: 32768, step: 1024, recommended: 8192 },
	thinking: { options: ["enabled", "disabled"], recommended: "enabled" }
};

const QWEN_HINTS: ModelParameterHints = {
	...COMMON_HINTS,
	temperature: { min: 0, max: 2, step: 0.1, recommended: 0.7 },
	topP: { min: 0, max: 1, step: 0.05, recommended: 0.8 },
	thinking: { options: ["enabled", "disabled"], recommended: "disabled" }
};

const MINIMAX_HINTS: ModelParameterHints = {
	...COMMON_HINTS,
	temperature: { min: 0.01, max: 1, step: 0.01, recommended: 1 },
	topP: { min: 0, max: 1, step: 0.05, recommended: 1 },
	maxOutputTokens: { min: 1, max: 128000, step: 1024, recommended: 8192 },
	thinking: { options: ["enabled", "disabled"], recommended: "enabled" }
};

interface ModelSeed {
	id: string;
	displayName?: string;
	category?: string;
	contextLength?: number;
	maxOutputTokens?: number;
	vision?: boolean;
	visionProxyModelId?: string | null;
	temperature?: number | null;
	topP?: number | null;
	reasoningEffort?: string;
	thinking?: "enabled" | "disabled";
	extraBody?: Record<string, unknown>;
	hints?: ModelParameterHints;
}

interface ProviderSeed {
	provider: string;
	providerDisplayName: string;
	baseUrl: string;
	documentationUrl: string;
	hints: ModelParameterHints;
	models: readonly ModelSeed[];
}

export const PROVIDER_CATALOG: readonly ProviderSeed[] = [
	{
		provider: "deepseek",
		providerDisplayName: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		documentationUrl: "https://api-docs.deepseek.com/zh-cn/",
		hints: DEEPSEEK_HINTS,
		models: [
			{ id: "deepseek-v4-pro", displayName: "DeepSeek v4 Pro", category: "Reasoning / Agent", contextLength: 1048576, maxOutputTokens: 32768, temperature: 1, topP: 1, reasoningEffort: "high", thinking: "enabled", visionProxyModelId: "" },
			{ id: "deepseek-v4-flash", displayName: "DeepSeek v4 Flash", category: "Fast / General", contextLength: 1048576, maxOutputTokens: 32768, temperature: 1, topP: 1, reasoningEffort: "high", thinking: "enabled", visionProxyModelId: "" }
		]
	},
	{
		provider: "zhipu",
		providerDisplayName: "Zhipu / Z.AI",
		baseUrl: "https://open.bigmodel.cn/api/paas/v4",
		documentationUrl: "https://docs.bigmodel.cn/cn/api/introduction",
		hints: {
			...ZHIPU_REASONING_HINTS
		},
		models: [
			{ id: "glm-5.1", displayName: "GLM 5.1", category: "Flagship / Agent Coding", contextLength: 200000, maxOutputTokens: 128000, temperature: 0.6, topP: 1, thinking: "enabled" },
			{ id: "glm-5v-turbo", displayName: "GLM 5V Turbo", category: "Vision / Multimodal", contextLength: 128000, maxOutputTokens: 8192, vision: true, temperature: 0.6, topP: 1, thinking: "disabled" },
			{ id: "glm-4.6v", displayName: "GLM 4.6V", category: "Vision / Agent Coding", contextLength: 128000, maxOutputTokens: 8192, vision: true, temperature: 0.6, topP: 1, thinking: "disabled" },
			{ id: "glm-4.5v", displayName: "GLM 4.5V", category: "Vision / Reasoning", contextLength: 128000, maxOutputTokens: 8192, vision: true, temperature: 0.6, topP: 1, thinking: "disabled" },
			{ id: "glm-4.6", displayName: "GLM 4.6", category: "Agent Coding", contextLength: 200000, maxOutputTokens: 128000, temperature: 0.6, topP: 1, thinking: "enabled" },
			{ id: "glm-4.5", displayName: "GLM 4.5", category: "Reasoning / Agent", contextLength: 128000, maxOutputTokens: 65536, temperature: 0.6, topP: 1, thinking: "enabled" },
			{ id: "glm-4.5-air", displayName: "GLM 4.5 Air", category: "Fast Reasoning", contextLength: 128000, maxOutputTokens: 65536, temperature: 0.6, topP: 1, thinking: "enabled" },
			{ id: "glm-4-plus", displayName: "GLM 4 Plus", category: "General", contextLength: 128000, maxOutputTokens: 8192, temperature: 0.6, topP: 1, thinking: "disabled" },
			{ id: "glm-4-air", displayName: "GLM 4 Air", category: "Fast / General", contextLength: 128000, maxOutputTokens: 8192, temperature: 0.6, topP: 1, thinking: "disabled" },
			{ id: "glm-4-flash", displayName: "GLM 4 Flash", category: "Cost Efficient", contextLength: 128000, maxOutputTokens: 8192, temperature: 0.6, topP: 1, thinking: "disabled" }
		]
	},
	{
		provider: "minimax",
		providerDisplayName: "MiniMax",
		baseUrl: "https://api.minimax.io/v1",
		documentationUrl: "https://platform.minimax.io/docs/api-reference/text-openai-api",
		hints: MINIMAX_HINTS,
		models: [
			{ id: "MiniMax-M2.7", displayName: "MiniMax M2.7", category: "Agentic / Reasoning", contextLength: 204800, maxOutputTokens: 128000, temperature: 1, topP: 1, thinking: "enabled", extraBody: { reasoning_split: true } },
			{ id: "MiniMax-M2.7-highspeed", displayName: "MiniMax M2.7 Highspeed", category: "Fast Agentic / Reasoning", contextLength: 204800, maxOutputTokens: 128000, temperature: 1, topP: 1, thinking: "enabled", extraBody: { reasoning_split: true } },
			{ id: "MiniMax-M2.5", displayName: "MiniMax M2.5", category: "Coding / Reasoning", contextLength: 204800, maxOutputTokens: 128000, temperature: 1, topP: 1, thinking: "enabled", extraBody: { reasoning_split: true } },
			{ id: "MiniMax-M2.5-highspeed", displayName: "MiniMax M2.5 Highspeed", category: "Fast Coding / Reasoning", contextLength: 204800, maxOutputTokens: 128000, temperature: 1, topP: 1, thinking: "enabled", extraBody: { reasoning_split: true } },
			{ id: "MiniMax-M2.1", displayName: "MiniMax M2.1", category: "Legacy Agentic / Reasoning", contextLength: 204800, maxOutputTokens: 128000, temperature: 1, topP: 1, thinking: "enabled", extraBody: { reasoning_split: true } },
			{ id: "MiniMax-M2.1-highspeed", displayName: "MiniMax M2.1 Highspeed", category: "Legacy Fast Reasoning", contextLength: 204800, maxOutputTokens: 128000, temperature: 1, topP: 1, thinking: "enabled", extraBody: { reasoning_split: true } },
			{ id: "MiniMax-M2", displayName: "MiniMax M2", category: "Agentic / Function Calling", contextLength: 204800, maxOutputTokens: 128000, temperature: 1, topP: 1, thinking: "enabled", extraBody: { reasoning_split: true } }
		]
	},
	{
		provider: "kimi",
		providerDisplayName: "Kimi / Moonshot",
		baseUrl: "https://api.moonshot.ai/v1",
		documentationUrl: "https://platform.kimi.ai/docs/models",
		hints: COMMON_HINTS,
		models: [
			{ id: "kimi-k2.6", displayName: "Kimi K2.6", category: "Latest / Multimodal", contextLength: 256000, maxOutputTokens: 32768, vision: true, temperature: 1, topP: 0.95, thinking: "enabled", hints: KIMI_K26_HINTS },
			{ id: "kimi-k2.5", displayName: "Kimi K2.5", category: "Multimodal", contextLength: 256000, maxOutputTokens: 32768, vision: true, temperature: 1, topP: 1, thinking: "enabled", hints: KIMI_K26_HINTS },
			{ id: "kimi-k2-0905-preview", category: "K2 Deprecated May 2026", contextLength: 256000, maxOutputTokens: 8192, temperature: 0.6, topP: 1 },
			{ id: "kimi-k2-0711-preview", category: "K2 Deprecated May 2026", contextLength: 128000, maxOutputTokens: 8192, temperature: 0.6, topP: 1 },
			{ id: "kimi-k2-turbo-preview", category: "K2 Deprecated May 2026", contextLength: 256000, maxOutputTokens: 8192, temperature: 0.6, topP: 1 },
			{ id: "kimi-k2-thinking", category: "K2 Thinking Deprecated May 2026", contextLength: 256000, maxOutputTokens: 8192, temperature: 1, topP: 1, thinking: "enabled" },
			{ id: "kimi-k2-thinking-turbo", category: "K2 Thinking Deprecated May 2026", contextLength: 256000, maxOutputTokens: 8192, temperature: 1, topP: 1, thinking: "enabled" },
			{ id: "moonshot-v1-8k", category: "Moonshot V1", contextLength: 8192, maxOutputTokens: 4096, temperature: 0, topP: 1 },
			{ id: "moonshot-v1-32k", category: "Moonshot V1", contextLength: 32768, maxOutputTokens: 4096, temperature: 0, topP: 1 },
			{ id: "moonshot-v1-128k", category: "Moonshot V1", contextLength: 128000, maxOutputTokens: 4096, temperature: 0, topP: 1 },
			{ id: "moonshot-v1-8k-vision-preview", category: "Moonshot V1 Vision", contextLength: 8192, maxOutputTokens: 4096, vision: true, temperature: 0, topP: 1 },
			{ id: "moonshot-v1-32k-vision-preview", category: "Moonshot V1 Vision", contextLength: 32768, maxOutputTokens: 4096, vision: true, temperature: 0, topP: 1 },
			{ id: "moonshot-v1-128k-vision-preview", category: "Moonshot V1 Vision", contextLength: 128000, maxOutputTokens: 4096, vision: true, temperature: 0, topP: 1 }
		]
	},
	{
		provider: "qwen",
		providerDisplayName: "Qwen / DashScope",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		documentationUrl: "https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope",
		hints: QWEN_HINTS,
		models: [
			...ids("Commercial / Max", ["qwen3-max", "qwen3-max-preview", "qwen-max", "qwen-max-latest"], 128000, 8192),
			...ids("Commercial / Plus", ["qwen3.5-plus", "qwen-plus", "qwen-plus-latest", "qwen-plus-us"], 128000, 8192),
			...ids("Commercial / Flash", ["qwen3.5-flash", "qwen-flash", "qwen-flash-us"], 128000, 8192),
			...ids("Commercial / Turbo", ["qwen-turbo", "qwen-turbo-latest"], 128000, 8192),
			...ids("Coder", ["qwen3-coder-plus", "qwen3-coder-flash", "qwen-coder-plus", "qwen-coder-plus-latest", "qwen-coder-turbo", "qwen-coder-turbo-latest"], 128000, 8192),
			...ids("Reasoning / QwQ", ["qwq-plus", "qwq-plus-latest"], 128000, 8192, { thinking: "enabled" }),
			...ids("Math", ["qwen-math-plus", "qwen-math-plus-latest", "qwen-math-turbo", "qwen-math-turbo-latest"], 128000, 8192),
			...ids("Open Source / Qwen3.5", ["qwen3.5-397b-a17b", "qwen3.5-120b-a10b", "qwen3.5-27b", "qwen3.5-35b-a3b"], 128000, 8192),
			...ids("Open Source / Qwen3 Thinking", ["qwen3-next-80b-a3b-thinking", "qwen3-235b-a22b-thinking-2507", "qwen3-30b-a3b-thinking-2507"], 128000, 8192, { thinking: "enabled" }),
			...ids("Open Source / Qwen3", ["qwen3-next-80b-a3b-instruct", "qwen3-235b-a22b-instruct-2507", "qwen3-30b-a3b-instruct-2507", "qwen3-235b-a22b", "qwen3-32b", "qwen3-30b-a3b", "qwen3-14b", "qwen3-8b", "qwen3-4b", "qwen3-1.7b", "qwen3-0.6b"], 128000, 8192),
			...ids("Open Source / Qwen2.5", ["qwen2.5-14b-instruct-1m", "qwen2.5-7b-instruct-1m"], 1000000, 8192),
			...ids("Open Source / Qwen2.5", ["qwen2.5-72b-instruct", "qwen2.5-32b-instruct", "qwen2.5-14b-instruct", "qwen2.5-7b-instruct", "qwen2.5-3b-instruct", "qwen2.5-1.5b-instruct", "qwen2.5-0.5b-instruct"], 128000, 8192)
		]
	}
];

export const BUILT_IN_PRESETS: readonly ModelConfig[] = PROVIDER_CATALOG.flatMap((provider) =>
	provider.models.map((seed) => createModel(provider, seed))
);

function ids(category: string, modelIds: string[], contextLength: number, maxOutputTokens: number, extra: Partial<ModelSeed> = {}): ModelSeed[] {
	return modelIds.map((id) => ({ id, category, contextLength, maxOutputTokens, ...extra }));
}

function createModel(provider: ProviderSeed, seed: ModelSeed): ModelConfig {
	const hints = seed.hints ?? provider.hints;
	const thinkingType = seed.thinking ?? hints.thinking?.recommended;
	return {
		id: seed.id,
		displayName: seed.displayName ?? seed.id,
		provider: provider.provider,
		providerDisplayName: provider.providerDisplayName,
		category: seed.category,
		baseUrl: provider.baseUrl,
		family: "oai-compatible",
		contextLength: seed.contextLength ?? DEFAULT_CONTEXT_LENGTH,
		maxOutputTokens: seed.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
		vision: seed.vision ?? false,
		visionProxyModelId: seed.visionProxyModelId,
		toolCalling: true,
		temperature: seed.temperature ?? hints.temperature?.recommended,
		topP: seed.topP ?? hints.topP?.recommended,
		reasoningEffort: seed.reasoningEffort ?? hints.reasoningEffort?.recommended,
		thinking: thinkingType ? { type: thinkingType as "enabled" | "disabled" } : undefined,
		headers: {},
		extraBody: seed.extraBody ?? {},
		includeReasoningInRequest: false,
		editTools: EDIT_TOOLS,
		parameterHints: hints,
		documentationUrl: provider.documentationUrl,
		builtIn: true
	};
}
