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
import type { ModelConfig, StreamEvent } from "./types";
import { convertMessages, estimateTokens } from "./openaiCompat/messages";
import { buildHeaders, buildRequestBody } from "./openaiCompat/request";
import { sendChatCompletion } from "./openaiCompat/client";

type ResponseProgress = Progress<LanguageModelResponsePart | vscode.LanguageModelDataPart | vscode.LanguageModelThinkingPart>;

export class ExtendedModelsProvider implements LanguageModelChatProvider {
	constructor(
		private readonly secrets: vscode.SecretStorage,
		private readonly logger: Logger
	) {}

	async provideLanguageModelChatInformation(
		_options: { readonly silent: boolean },
		_token: CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		const settings = getSettings();
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
		const settings = getSettings();
		this.logger.setLevel(settings.logLevel);

		const model = findModelConfig(modelInfo.id, settings.models);
		if (!model) {
			throw new ProviderError(`Model configuration not found: ${modelInfo.id}`, { code: "CONFIG", retryable: false });
		}

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
		const openAiMessages = convertMessages(messages, model, roleIds);
		const requiredToolName = getRequiredToolName(options);
		const body = buildRequestBody(model, openAiMessages, options, requiredToolName);
		const headers = buildHeaders(apiKey, model);

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
				onEvent: (event) => reportStreamEvent(progress, event),
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
}

function toLanguageModelInfo(model: ModelConfig): LanguageModelChatInformation {
	const maxOutput = model.maxCompletionTokens ?? model.maxOutputTokens;
	const maxInput = Math.max(1, model.contextLength - maxOutput);
	const detail = `${model.providerDisplayName ?? model.provider}${model.category ? ` · ${model.category}` : ""}`;

	return {
		id: getRuntimeModelId(model),
		name: model.displayName || model.id,
		family: model.family || "oai-compatible",
		version: "1.0.0",
		maxInputTokens: maxInput,
		maxOutputTokens: maxOutput,
		tooltip: `${model.id} via ${model.baseUrl ?? "default base URL"}`,
		detail,
		isUserSelectable: true,
		category: {
			label: "Extended Models",
			order: 50
		},
		capabilities: {
			imageInput: model.vision,
			toolCalling: model.toolCalling,
			editTools: model.editTools.length > 0 ? model.editTools : undefined
		}
	};
}

function getRequiredToolName(options: ProvideLanguageModelChatResponseOptions): string | undefined {
	const tools = options.tools ?? [];
	const toolMode = (vscode as unknown as { LanguageModelChatToolMode?: { Required?: unknown } }).LanguageModelChatToolMode;
	const required = toolMode?.Required !== undefined && options.toolMode === toolMode.Required;
	if (!required) {
		return undefined;
	}
	if (tools.length !== 1) {
		throw new ProviderError("ToolMode.Required is only supported when VS Code provides exactly one tool.", {
			code: "TOOL_MODE",
			retryable: false
		});
	}
	return tools[0].name;
}

function reportStreamEvent(progress: ResponseProgress, event: StreamEvent): void {
	if (event.type === "text") {
		progress.report(new vscode.LanguageModelTextPart(event.text));
		return;
	}
	if (event.type === "tool_call") {
		progress.report(new vscode.LanguageModelToolCallPart(event.id, event.name, event.input));
		return;
	}

	const ThinkingPart = (vscode as unknown as { LanguageModelThinkingPart?: typeof vscode.LanguageModelThinkingPart }).LanguageModelThinkingPart;
	if (ThinkingPart) {
		progress.report(new ThinkingPart(event.text, event.id));
	} else {
		progress.report(new vscode.LanguageModelTextPart(event.text));
	}
}
