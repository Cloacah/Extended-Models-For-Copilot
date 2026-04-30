import * as vscode from "vscode";
import type {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatProvider,
	LanguageModelChatRequestMessage,
	LanguageModelResponsePart,
	Progress,
	ProvideLanguageModelChatResponseOptions
} from "vscode";
import { findModelConfig, getRuntimeModelId, getSettings, validateModelConfig } from "./config/settings";
import { ProviderError, normalizeUnknownError } from "./errors";
import { Logger } from "./logger";
import { ensureApiKey } from "./secrets";
import type { ChatCompletionUsage, ModelConfig, OpenAIMessage, OpenAIToolCall, StreamEvent } from "./types";
import { convertMessages, encodeReasoningMarker, estimateOpenAIMessageTokens, estimateTokens, normalizeToolCallId, repairReasoningToolHistory } from "./openaiCompat/messages";
import { buildHeaders, buildRequestBody } from "./openaiCompat/request";
import { sendChatCompletion } from "./openaiCompat/client";
import { fingerprintAssistantTurn, readReasoningCache, ReasoningCache, writeReasoningCache } from "./reasoningCache";
import { prependSelectedPromptPreset } from "./promptPresets";
import { resolveVisionProxyMessages } from "./visionProxy";

type ResponseProgress = Progress<LanguageModelResponsePart>;

interface ResponseReplayState {
	reasoningParts: string[];
	textParts: string[];
	toolCallIds: string[];
	toolCalls: OpenAIToolCall[];
	displayedThinkingLength: number;
	usage?: ChatCompletionUsage;
}

type ModelPickerOptions = ProvideLanguageModelChatResponseOptions & {
	readonly modelConfiguration?: Record<string, unknown>;
	readonly modelOptions?: Record<string, unknown>;
	readonly configuration?: Record<string, unknown>;
};

type ModelPickerChatInformation = LanguageModelChatInformation & {
	readonly isUserSelectable?: boolean;
	readonly statusIcon?: vscode.ThemeIcon;
	readonly configurationSchema?: unknown;
};

export class ExtendedModelsProvider implements LanguageModelChatProvider {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
	private readonly reasoningByToolCallId = new Map<string, string>();
	private readonly assistantMessageByToolCallId = new Map<string, OpenAIMessage>();
	private readonly reasoningCache: ReasoningCache;
	private readonly statusBar: vscode.StatusBarItem;
	readonly onDidChangeLanguageModelChatInformation = this.onDidChangeEmitter.event;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly secrets: vscode.SecretStorage,
		private readonly logger: Logger,
		private readonly getSettingsForProvider = getSettings
	) {
		this.reasoningCache = readReasoningCache(context);
		this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
		this.statusBar.name = "Copilot Bro Token Usage";
		this.statusBar.command = "extendedModels.showOutput";
		this.statusBar.tooltip = "Estimated token usage for Copilot Bro. Copilot's built-in context widget may show 0% for third-party providers due to a VS Code/Copilot limitation.";
		context.subscriptions.push(this.statusBar);
	}

	refreshModels(): void {
		this.onDidChangeEmitter.fire();
	}

	dispose(): void {
		this.onDidChangeEmitter.dispose();
		this.statusBar.dispose();
	}

	async provideLanguageModelChatInformation(
		_options: { readonly silent: boolean },
		_token: CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		const settings = this.getSettingsForProvider();
		this.logger.setLevel(settings.logLevel);

		return settings.models.map((model) => toLanguageModelInfo(model));
	}

	async provideTokenCount(
		_model: LanguageModelChatInformation,
		text: string | LanguageModelChatRequestMessage,
		_token: CancellationToken
	): Promise<number> {
		return estimateTokens(text);
	}

	async provideLanguageModelChatResponse(
		modelInfo: LanguageModelChatInformation,
		messages: readonly LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		progress: ResponseProgress,
		token: CancellationToken
	): Promise<void> {
		const settings = this.getSettingsForProvider();
		this.logger.setLevel(settings.logLevel);

		const configuredModel = findModelConfig(modelInfo.id, settings.models);
		if (!configuredModel) {
			throw new ProviderError(`Model configuration not found: ${modelInfo.id}`, { code: "CONFIG", retryable: false });
		}
		const model = applyPickerConfiguration(configuredModel, options as ModelPickerOptions);
		await persistPickerConfiguration(configuredModel, model, this.logger);

		const validationError = validateModelConfig(model);
		if (validationError) {
			throw new ProviderError(validationError, { code: "CONFIG", retryable: false });
		}

		const apiKey = await ensureApiKey(this.secrets, model);
		if (!apiKey) {
			throw new ProviderError(`Missing API key for provider ${model.provider}.`, { code: "AUTH", retryable: false });
		}

		const roleIds = {
			user: vscode.LanguageModelChatMessageRole.User,
			assistant: vscode.LanguageModelChatMessageRole.Assistant
		};
		const resolvedMessages = await resolveVisionProxyMessages(messages, model, settings, this.logger, token);
		let openAiMessages = convertMessages(resolvedMessages, model, roleIds);
		openAiMessages = await prependSelectedPromptPreset(this.context, settings, openAiMessages);
		openAiMessages = repairReasoningToolHistory(openAiMessages, model, {
			getReasoning: (callId) => this.reasoningByToolCallId.get(callId),
			getAssistantMessage: (callId) => this.assistantMessageByToolCallId.get(callId),
			getReasoningForAssistant: (message) => this.reasoningCache.get(fingerprintAssistantTurn(message))
		});
		const toolChoice = getToolChoice(options);
		const body = buildRequestBody(model, openAiMessages, options, toolChoice);
		const headers = buildHeaders(apiKey, model);
		const estimatedPromptTokens = estimateOpenAIMessageTokens(openAiMessages);
		this.updateStatusBar(model, estimatedPromptTokens);
		const replayState: ResponseReplayState = {
			reasoningParts: [],
			textParts: [],
			toolCallIds: [],
			toolCalls: [],
			displayedThinkingLength: 0
		};

		this.logger.info("request.start", {
			model: model.id,
			provider: model.provider,
			baseUrl: model.baseUrl,
			messageCount: messages.length
		});
		this.logger.debug("request.body", {
			...body,
			messages: `[${body.messages.length} messages]`
		});

		try {
			await sendChatCompletion({
				apiKey,
				model,
				body,
				headers,
				retry: settings.retry,
				timeoutMs: settings.requestTimeoutMs,
				cancellation: token,
				onEvent: (event) => {
					trackReplayState(replayState, event);
					reportStreamEvent(progress, event, replayState);
				},
				onRetry: (attempt, delayMs, error) => {
					this.logger.warn("request.retry", {
						model: model.id,
						attempt,
						delayMs,
						status: error.status,
						code: error.code,
						message: error.message
					});
				}
			});
			flushThinkingDisplay(progress, replayState, true);
			await this.rememberReasoning(replayState);
			this.updateStatusBar(model, estimatedPromptTokens, replayState);
			this.logger.info("request.end", { model: model.id });
		} catch (error) {
			const normalized = normalizeUnknownError(error);
			this.logger.error("request.failed", {
				model: model.id,
				provider: model.provider,
				status: normalized.status,
				code: normalized.code,
				message: normalized.message,
				url: normalized.url,
				body: normalized.body
			});
			throw normalized;
		}
	}

	private async rememberReasoning(state: ResponseReplayState): Promise<void> {
		const reasoning = state.reasoningParts.join("").trim();
		if (!reasoning) {
			return;
		}
		const assistantMessage: OpenAIMessage = {
			role: "assistant",
			content: state.textParts.join("") || "",
			reasoning_content: reasoning,
			tool_calls: state.toolCalls.length > 0 ? state.toolCalls : undefined
		};
		const fingerprint = fingerprintAssistantTurn(assistantMessage);
		if (fingerprint) {
			this.reasoningCache.set(fingerprint, reasoning);
			await writeReasoningCache(this.context, this.reasoningCache);
		}
		for (const toolCallId of state.toolCallIds) {
			const normalizedId = normalizeToolCallId(toolCallId);
			this.reasoningByToolCallId.set(normalizedId, reasoning);
			this.assistantMessageByToolCallId.set(normalizedId, assistantMessage);
		}
		trimMap(this.reasoningByToolCallId, 200);
		trimMap(this.assistantMessageByToolCallId, 200);
	}

	private updateStatusBar(model: ModelConfig, promptTokens: number, state?: ResponseReplayState): void {
		const maxOutput = getEffectiveMaxOutputTokens(model);
		const maxInput = getEffectiveMaxInputTokens(model);
		const completionTokens = normalizeTokenNumber(state?.usage?.completion_tokens)
			?? estimateTokens(state?.textParts.join("") ?? "");
		const actualPromptTokens = normalizeTokenNumber(state?.usage?.prompt_tokens) ?? promptTokens;
		const totalTokens = normalizeTokenNumber(state?.usage?.total_tokens) ?? actualPromptTokens + completionTokens;
		const percent = Math.min(999, Math.max(0, Math.round((actualPromptTokens / Math.max(1, maxInput)) * 100)));
		const modelName = model.displayName ?? model.id;
		this.statusBar.text = `$(pulse) Bro ${formatCompactTokens(actualPromptTokens)}/${formatCompactTokens(maxInput)} (${percent}%)`;
		this.statusBar.tooltip = [
			`${modelName}`,
			`Prompt: ${actualPromptTokens.toLocaleString()} / ${maxInput.toLocaleString()} input tokens`,
			`Completion: ${completionTokens.toLocaleString()} / ${maxOutput.toLocaleString()} output tokens`,
			`Total: ${totalTokens.toLocaleString()} tokens`,
			"Note: Copilot's built-in context window can show 0% for third-party providers; this status item uses the provider's own estimate/usage."
		].join("\n");
		this.statusBar.show();
	}
}

function toLanguageModelInfo(model: ModelConfig): LanguageModelChatInformation {
	const maxOutput = getEffectiveMaxOutputTokens(model);
	const maxInput = getEffectiveMaxInputTokens(model);
	const detailParts = [
		model.providerDisplayName ?? model.provider,
		model.category,
		model.thinking?.type === "enabled" ? "thinking" : undefined,
		model.vision ? "vision" : undefined,
		model.toolCalling ? "tools" : undefined
	].filter(Boolean);

	const info: ModelPickerChatInformation = {
		id: getRuntimeModelId(model),
		name: model.displayName || model.id,
		family: model.family || "oai-compatible",
		version: "1.0.0",
		maxInputTokens: maxInput,
		maxOutputTokens: maxOutput,
		tooltip: createModelTooltip(model, maxInput, maxOutput),
		detail: detailParts.join(" · "),
		isUserSelectable: true,
		configurationSchema: createModelConfigurationSchema(model),
		capabilities: {
			imageInput: model.vision || Boolean(model.visionProxyModelId),
			toolCalling: model.toolCalling
		}
	};
	return info;
}

function createModelTooltip(model: ModelConfig, maxInput: number, maxOutput: number): string {
	const hints = model.parameterHints ?? {};
	return [
		`${model.displayName ?? model.id} (${model.id})`,
		`Provider: ${model.providerDisplayName ?? model.provider}`,
		`Base URL: ${model.baseUrl ?? "default"}`,
		`Context: ${formatCompactTokens(maxInput)} input + ${formatCompactTokens(maxOutput)} output`,
		`Vision: ${model.vision ? "native" : model.visionProxyModelId ? "proxy" : "no"}; Tools: ${model.toolCalling ? "yes" : "no"}; Thinking: ${model.thinking?.type ?? "not set"}`,
		`Temperature: ${model.temperature ?? hints.temperature?.recommended ?? "not set"}`,
		"Use Copilot Bro: Open Model Settings for the full editor. Newer Copilot hosts may also show quick controls here."
	].join("\n");
}

function createModelConfigurationSchema(model: ModelConfig): unknown {
	const properties: Record<string, unknown> = {};
	const hints = model.parameterHints ?? {};
	if (hints.temperature) {
		properties.temperature = {
			type: "number",
			title: "Temperature",
			minimum: hints.temperature.min,
			maximum: hints.temperature.max,
			default: model.temperature ?? hints.temperature.recommended,
			group: "navigation"
		};
	}
	return Object.keys(properties).length > 0 ? { properties } : undefined;
}

function applyPickerConfiguration(model: ModelConfig, options: ModelPickerOptions): ModelConfig {
	const configuration = mergePickerConfigurations(options.modelConfiguration, options.modelOptions, options.configuration);
	const next: ModelConfig = { ...model };
	const reasoningEffort = getConfiguredReasoningEffort(model, configuration);
	if (reasoningEffort) {
		next.reasoningEffort = reasoningEffort;
	}
	const temperature = getConfigurationNumber(configuration, ["temperature"]);
	if (temperature !== undefined) {
		const hint = model.parameterHints?.temperature;
		const min = hint?.min ?? 0;
		const max = hint?.max ?? 2;
		next.temperature = Math.min(max, Math.max(min, temperature));
	}
	return next;
}

function mergePickerConfigurations(...sources: Array<Record<string, unknown> | undefined>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const source of sources) {
		if (!source || typeof source !== "object") {
			continue;
		}
		Object.assign(out, source);
	}
	return out;
}

function getConfiguredReasoningEffort(model: ModelConfig, configuration: Record<string, unknown>): string | undefined {
	const raw = getConfigurationValue(configuration, ["reasoningEffort", "reasoning_effort", "thinkingEffort", "thinking_effort", "thinkingLevel", "thinking_level"]);
	const value = typeof raw === "string" ? raw.trim() : undefined;
	if (!value) {
		return undefined;
	}
	const options = model.parameterHints?.reasoningEffort?.options;
	if (!options?.length) {
		return value;
	}
	const normalized = value.toLowerCase();
	const matched = options.find((option) => option.toLowerCase() === normalized);
	return matched;
}

async function persistPickerConfiguration(base: ModelConfig, configured: ModelConfig, logger: Logger): Promise<void> {
	if (base.reasoningEffort === configured.reasoningEffort && base.temperature === configured.temperature) {
		return;
	}
	const config = vscode.workspace.getConfiguration("extendedModels");
	const current = config.get<unknown[]>("models", []);
	const targetId = getRuntimeModelId(configured);
	const next = current.filter((item) => {
		if (!item || typeof item !== "object") {
			return true;
		}
		const candidate = item as Partial<ModelConfig>;
		if (!candidate.id || !candidate.provider) {
			return true;
		}
		return getRuntimeModelId(candidate as Pick<ModelConfig, "id" | "configId" | "provider">) !== targetId;
	});
	const override: ModelConfig = { ...configured, builtIn: undefined };
	next.push(override);
	await config.update("models", next, vscode.ConfigurationTarget.Global);
	logger.info("modelPicker.configuration.persisted", {
		model: configured.id,
		reasoningEffort: configured.reasoningEffort,
		temperature: configured.temperature
	});
}

function getConfigurationString(configuration: Record<string, unknown>, keys: string[]): string | undefined {
	const value = getConfigurationValue(configuration, keys);
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getConfigurationNumber(configuration: Record<string, unknown>, keys: string[]): number | undefined {
	const value = getConfigurationValue(configuration, keys);
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
		return Number(value);
	}
	return undefined;
}

function getConfigurationValue(configuration: unknown, keys: string[]): unknown {
	if (!configuration || typeof configuration !== "object") {
		return undefined;
	}
	const normalizedKeys = new Set(keys.map(normalizeConfigKey));
	for (const [key, value] of Object.entries(configuration as Record<string, unknown>)) {
		if (normalizedKeys.has(normalizeConfigKey(key))) {
			return value;
		}
	}
	for (const value of Object.values(configuration as Record<string, unknown>)) {
		const nested = getConfigurationValue(value, keys);
		if (nested !== undefined) {
			return nested;
		}
	}
	return undefined;
}

function normalizeConfigKey(key: string): string {
	return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isAllowedReasoningEffort(model: ModelConfig, value: string): boolean {
	const options = model.parameterHints?.reasoningEffort?.options;
	return !options?.length || options.includes(value);
}

function getToolChoice(options: ProvideLanguageModelChatResponseOptions): "required" | string | undefined {
	const tools = options.tools ?? [];
	const toolMode = (vscode as unknown as { LanguageModelChatToolMode?: { Required?: unknown } }).LanguageModelChatToolMode;
	const required = toolMode?.Required !== undefined && options.toolMode === toolMode.Required;
	if (!required) {
		return undefined;
	}
	return tools.length === 1 ? tools[0].name : "required";
}

function reportStreamEvent(progress: ResponseProgress, event: StreamEvent, state: ResponseReplayState): void {
	if (event.type === "thinking") {
		reportThinking(progress, event.text, event.id, state, false);
		return;
	}
	flushThinkingDisplay(progress, state, true);
	if (event.type === "text") {
		progress.report(new vscode.LanguageModelTextPart(event.text));
		return;
	}
	if (event.type === "tool_call") {
		progress.report(new vscode.LanguageModelToolCallPart(event.id, event.name, event.input));
		return;
	}
}

function trackReplayState(state: ResponseReplayState, event: StreamEvent): void {
	if (event.type === "thinking") {
		state.reasoningParts.push(event.text);
	} else if (event.type === "text") {
		state.textParts.push(event.text);
	} else if (event.type === "tool_call") {
		state.toolCallIds.push(event.id);
		state.toolCalls.push({
			id: event.id,
			type: "function",
			function: {
				name: event.name,
				arguments: JSON.stringify(event.input)
			}
		});
	} else if (event.type === "usage") {
		state.usage = event.usage;
	}
}

function getEffectiveMaxOutputTokens(model: ModelConfig): number {
	const configured = model.maxCompletionTokens ?? model.maxOutputTokens;
	return Math.max(1, Math.min(configured, Math.max(1, model.contextLength - 1)));
}

function getEffectiveMaxInputTokens(model: ModelConfig): number {
	return Math.max(1, model.contextLength - getEffectiveMaxOutputTokens(model));
}

function normalizeTokenNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function formatCompactTokens(value: number): string {
	if (value >= 1000000) {
		return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
	}
	return String(value);
}

function reportThinking(
	progress: ResponseProgress,
	text: string,
	id: string | undefined,
	state: ResponseReplayState,
	force: boolean
): void {
	const thinkingPart = (vscode as unknown as {
		LanguageModelThinkingPart?: new (value: string, id?: string) => LanguageModelResponsePart;
	}).LanguageModelThinkingPart;
	if (thinkingPart) {
		progress.report(new thinkingPart(text, id));
		state.displayedThinkingLength += text.length;
		return;
	}

	const allReasoning = state.reasoningParts.join("");
	if (!force && allReasoning.length - state.displayedThinkingLength < 800) {
		return;
	}
	flushThinkingDisplay(progress, state, force);
}

function flushThinkingDisplay(progress: ResponseProgress, state: ResponseReplayState, force: boolean): void {
	const allReasoning = state.reasoningParts.join("");
	const chunk = allReasoning.slice(state.displayedThinkingLength);
	if (!chunk || (!force && chunk.length < 800)) {
		return;
	}
	state.displayedThinkingLength = allReasoning.length;
	progress.report(new vscode.LanguageModelTextPart(renderThinkingDetails(chunk)));
}

function renderThinkingDetails(text: string): string {
	const trimmed = text.trim();
	const summary = createThinkingSummary(trimmed);
	return [
		encodeReasoningMarker(text),
		`<details data-extended-models-reasoning="true">`,
		`<summary>思考过程 · ${summary}</summary>`,
		"",
		trimmed || text,
		"</details>",
		""
	].join("\n");
}

function createThinkingSummary(text: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return "正在思考";
	}
	const tail = normalized.slice(-96);
	return escapeHtml(tail);
}

function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function trimMap<TKey, TValue>(map: Map<TKey, TValue>, maxSize: number): void {
	while (map.size > maxSize) {
		const first = map.keys().next();
		if (first.done) {
			return;
		}
		map.delete(first.value);
	}
}
