import type { ProvideLanguageModelChatResponseOptions } from "vscode";
import type { ChatCompletionRequestBody, ModelConfig, OpenAIMessage, OpenAIToolDefinition } from "../types";

export function buildRequestBody(
	model: ModelConfig,
	messages: OpenAIMessage[],
	options: ProvideLanguageModelChatResponseOptions,
	requiredToolName?: string
): ChatCompletionRequestBody {
	const body: ChatCompletionRequestBody = {
		model: model.id,
		messages,
		stream: true,
		stream_options: { include_usage: true }
	};

	if (model.temperature !== undefined && model.temperature !== null) {
		body.temperature = model.temperature;
	}
	if (model.topP !== undefined && model.topP !== null) {
		body.top_p = model.topP;
	}
	if (model.maxCompletionTokens !== undefined) {
		body.max_completion_tokens = model.maxCompletionTokens;
	} else {
		body.max_tokens = model.maxOutputTokens;
	}
	if (model.reasoningEffort) {
		body.reasoning_effort = model.reasoningEffort;
	}
	if (model.thinking?.type) {
		body.thinking = { type: model.thinking.type };
	}

	const tools = convertTools(options.tools ?? []);
	if (tools.length > 0 && model.toolCalling) {
		body.tools = tools;
		const supportsRequiredToolChoice = model.provider !== "kimi";
		body.tool_choice = requiredToolName && supportsRequiredToolChoice
			? { type: "function", function: { name: requiredToolName } }
			: "auto";
	}

	for (const [key, value] of Object.entries(model.extraBody)) {
		if (value !== undefined) {
			body[key] = value;
		}
	}

	return body;
}

export function buildHeaders(apiKey: string, model: ModelConfig): Record<string, string> {
	return {
		"Authorization": `Bearer ${apiKey}`,
		"Content-Type": "application/json",
		"Accept": "text/event-stream",
		"User-Agent": "extended-models-for-copilot/0.1.0",
		...model.headers
	};
}

function convertTools(tools: readonly unknown[]): OpenAIToolDefinition[] {
	return tools
		.filter((tool): tool is { name: string; description?: string; inputSchema?: unknown } => {
			return Boolean(tool)
				&& typeof tool === "object"
				&& typeof (tool as Record<string, unknown>).name === "string";
		})
		.map((tool) => ({
			type: "function",
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.inputSchema ?? {
					type: "object",
					properties: {}
				}
			}
		}));
}
