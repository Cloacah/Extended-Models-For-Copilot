import * as vscode from "vscode";
import type { ExtensionSettings, LogLevel, ModelCatalogState, ModelConfig, PromptPresetSettings, RetrySettings, VisionProxySettings } from "../types";
import { BUILT_IN_PRESETS, DEFAULT_CONTEXT_LENGTH, DEFAULT_MAX_OUTPUT_TOKENS } from "./presets";

const DEFAULT_RETRY: RetrySettings = {
	enabled: true,
	maxAttempts: 3,
	baseDelayMs: 1000,
	statusCodes: []
};

const DEFAULT_VISION_PROXY: VisionProxySettings = {
	enabled: true,
	defaultModelId: "",
	prompt: "Describe the visual contents of each image in detail for a coding assistant. Include visible text, UI state, diagrams, errors, layout, colors, and any details needed to answer the user's request. Be factual and do not solve the task yourself."
};

const DEFAULT_PROMPT_PRESETS: PromptPresetSettings = {
	selectedId: ""
};

export function getSettings(catalogState?: ModelCatalogState): ExtensionSettings {
	const config = vscode.workspace.getConfiguration("extendedModels");
	const includeBuiltInPresets = config.get<boolean>("includeBuiltInPresets", true);
	const defaultBaseUrl = config.get<string>("defaultBaseUrl", "");
	const customModels = normalizeModels(config.get<unknown[]>("models", []), defaultBaseUrl);
	const visionProxy = normalizeVisionProxy(config.get<Partial<VisionProxySettings>>("visionProxy", DEFAULT_VISION_PROXY));
	const promptPresets = normalizePromptPresets(config.get<Partial<PromptPresetSettings>>("promptPresets", DEFAULT_PROMPT_PRESETS));
	const retry = normalizeRetry(config.get<Partial<RetrySettings>>("retry", DEFAULT_RETRY));
	const requestTimeoutMs = Math.max(1000, config.get<number>("requestTimeoutMs", 120000));
	const logLevel = config.get<LogLevel>("logLevel", "info");
	const uiLanguage = config.get<"zh" | "en">("uiLanguage", "zh");
	const catalogModels = catalogState ? normalizeModelConfigs(catalogState.models, defaultBaseUrl) : [];
	const builtIns = includeBuiltInPresets ? applyCatalogState([...BUILT_IN_PRESETS], catalogModels, catalogState) : [];
	const models = includeBuiltInPresets ? mergeModels(builtIns, customModels) : customModels;

	return {
		includeBuiltInPresets,
		defaultBaseUrl,
		models,
		visionProxy,
		promptPresets,
		retry,
		requestTimeoutMs,
		logLevel,
		uiLanguage
	};
}

export function getRuntimeModelId(model: Pick<ModelConfig, "id" | "configId" | "provider">): string {
	if (model.configId?.trim()) {
		return `${model.id}::${model.configId.trim()}`;
	}

	return `${model.id}::${model.provider.trim().toLowerCase()}`;
}

export function findModelConfig(runtimeId: string, models: readonly ModelConfig[]): ModelConfig | undefined {
	return models.find((model) => getRuntimeModelId(model) === runtimeId)
		?? models.find((model) => model.id === runtimeId);
}

export function listProviders(models: readonly ModelConfig[]): string[] {
	return Array.from(
		new Set(models.map((model) => model.provider.trim().toLowerCase()).filter(Boolean))
	).sort((a, b) => a.localeCompare(b));
}

export function validateModelConfig(model: ModelConfig): string | undefined {
	if (!model.id.trim()) {
		return "Model id is required.";
	}
	if (!model.provider.trim()) {
		return `Provider is required for model ${model.id}.`;
	}
	if (!model.baseUrl?.trim()) {
		return `Base URL is required for model ${model.id}.`;
	}
	if (!/^https?:\/\//i.test(model.baseUrl)) {
		return `Base URL for model ${model.id} must start with http:// or https://.`;
	}
	if (model.maxOutputTokens < 1) {
		return `maxOutputTokens for model ${model.id} must be greater than zero.`;
	}
	if (model.contextLength <= model.maxOutputTokens) {
		return `contextLength for model ${model.id} must be greater than maxOutputTokens.`;
	}
	if (model.maxCompletionTokens !== undefined && model.contextLength <= model.maxCompletionTokens) {
		return `contextLength for model ${model.id} must be greater than maxCompletionTokens.`;
	}
	return undefined;
}

export function mergeModels(builtIn: ModelConfig[], custom: ModelConfig[]): ModelConfig[] {
	const out = new Map<string, ModelConfig>();
	for (const model of builtIn) {
		out.set(getRuntimeModelId(model), model);
	}
	for (const model of custom) {
		const key = getRuntimeModelId(model);
		const base = out.get(key);
		out.set(key, base ? { ...base, ...model, builtIn: base.builtIn } : model);
	}
	return Array.from(out.values());
}

function applyCatalogState(builtIn: ModelConfig[], catalogModels: ModelConfig[], catalogState?: ModelCatalogState): ModelConfig[] {
	if (!catalogState || catalogModels.length === 0) {
		return builtIn;
	}

	const refreshedProviders = new Set(catalogState.refreshedProviders.map((provider) => provider.trim().toLowerCase()).filter(Boolean));
	if (refreshedProviders.size === 0) {
		return builtIn;
	}

	const retainedBuiltIns = builtIn.filter((model) => !refreshedProviders.has(model.provider.trim().toLowerCase()));
	return [
		...retainedBuiltIns,
		...catalogModels
	];
}

function normalizeModelConfigs(models: readonly ModelConfig[] | undefined, defaultBaseUrl: string): ModelConfig[] {
	return normalizeModels(models as unknown[] | undefined, defaultBaseUrl);
}

function normalizeRetry(input: Partial<RetrySettings> | undefined): RetrySettings {
	return {
		enabled: input?.enabled ?? DEFAULT_RETRY.enabled,
		maxAttempts: Math.max(1, Number(input?.maxAttempts ?? DEFAULT_RETRY.maxAttempts)),
		baseDelayMs: Math.max(1, Number(input?.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs)),
		statusCodes: Array.isArray(input?.statusCodes) ? input.statusCodes.filter((code) => Number.isFinite(code)) : []
	};
}

function normalizeModels(input: unknown[] | undefined, defaultBaseUrl: string): ModelConfig[] {
	if (!Array.isArray(input)) {
		return [];
	}

	const models: ModelConfig[] = [];
	for (const raw of input) {
		if (!raw || typeof raw !== "object") {
			continue;
		}
		const record = raw as Record<string, unknown>;
		const id = asString(record.id);
		const provider = asString(record.provider || record.owned_by || record.ownedBy);
		if (!id || !provider) {
			continue;
		}

		models.push({
			id,
			displayName: asString(record.displayName) || undefined,
			configId: asString(record.configId) || undefined,
			provider,
			providerDisplayName: asString(record.providerDisplayName) || undefined,
			category: asString(record.category) || undefined,
			baseUrl: asString(record.baseUrl) || defaultBaseUrl || undefined,
			family: asString(record.family) || "oai-compatible",
			contextLength: asPositiveNumber(record.contextLength, DEFAULT_CONTEXT_LENGTH),
			maxOutputTokens: asPositiveNumber(record.maxOutputTokens ?? record.max_tokens, DEFAULT_MAX_OUTPUT_TOKENS),
			maxCompletionTokens: asOptionalPositiveNumber(record.maxCompletionTokens ?? record.max_completion_tokens),
			vision: asBoolean(record.vision, false),
			visionProxyModelId: asOptionalNullableString(record.visionProxyModelId ?? record.vision_proxy_model_id),
			toolCalling: asBoolean(record.toolCalling, true),
			temperature: asNullableNumber(record.temperature),
			topP: asNullableNumber(record.topP ?? record.top_p),
			reasoningEffort: asString(record.reasoningEffort ?? record.reasoning_effort) || undefined,
			thinking: normalizeThinking(record.thinking),
			headers: normalizeStringRecord(record.headers),
			extraBody: normalizeSafeObject(record.extraBody ?? record.extra),
			includeReasoningInRequest: asBoolean(record.includeReasoningInRequest ?? record.include_reasoning_in_request, false),
			editTools: normalizeStringArray(record.editTools),
			parameterHints: normalizeObject(record.parameterHints) as ModelConfig["parameterHints"],
			documentationUrl: asString(record.documentationUrl) || undefined
		});
	}
	return models;
}

function normalizeVisionProxy(input: Partial<VisionProxySettings> | undefined): VisionProxySettings {
	return {
		enabled: input?.enabled ?? DEFAULT_VISION_PROXY.enabled,
		defaultModelId: asString(input?.defaultModelId) || DEFAULT_VISION_PROXY.defaultModelId,
		prompt: asString(input?.prompt) || DEFAULT_VISION_PROXY.prompt
	};
}

function normalizePromptPresets(input: Partial<PromptPresetSettings> | undefined): PromptPresetSettings {
	return {
		selectedId: asString(input?.selectedId) || DEFAULT_PROMPT_PRESETS.selectedId
	};
}

function normalizeThinking(value: unknown): { type?: "enabled" | "disabled" } | undefined {
	if (!value || typeof value !== "object") {
		return undefined;
	}
	const type = asString((value as Record<string, unknown>).type);
	if (type === "enabled" || type === "disabled") {
		return { type };
	}
	return undefined;
}

function normalizeObject(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function normalizeStringRecord(value: unknown): Record<string, string> {
	const object = normalizeObject(value);
	const out: Record<string, string> = {};
	for (const [key, item] of Object.entries(object)) {
		if (typeof item === "string" && !isSensitiveKey(key)) {
			out[key] = item;
		}
	}
	return out;
}

function normalizeSafeObject(value: unknown): Record<string, unknown> {
	const object = normalizeObject(value);
	const out: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(object)) {
		if (!isSensitiveKey(key)) {
			out[key] = item;
		}
	}
	return out;
}

function isSensitiveKey(key: string): boolean {
	const normalized = key.toLowerCase();
	return normalized.includes("authorization")
		|| normalized.includes("api-key")
		|| normalized.includes("apikey")
		|| normalized.includes("api_key")
		|| normalized.includes("token")
		|| normalized.includes("secret")
		|| normalized.includes("password")
		|| normalized === "cookie";
}

function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function asOptionalNullableString(value: unknown): string | null | undefined {
	if (value === null) {
		return null;
	}
	const text = asString(value);
	return text ? text : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function asPositiveNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function asOptionalPositiveNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
	if (value === null) {
		return null;
	}
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
