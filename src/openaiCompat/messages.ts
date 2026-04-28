import type { LanguageModelChatRequestMessage } from "vscode";
import type { ModelConfig, OpenAIContentPart, OpenAIMessage, OpenAIToolCall } from "../types";

export interface RoleIds {
	user: unknown;
	assistant: unknown;
}

export function convertMessages(
	messages: readonly LanguageModelChatRequestMessage[],
	model: ModelConfig,
	roleIds: RoleIds
): OpenAIMessage[] {
	const out: OpenAIMessage[] = [];

	for (const message of messages) {
		const role = mapRole(message.role, roleIds);
		const textParts: string[] = [];
		const imageParts: OpenAIContentPart[] = [];
		const toolCalls: OpenAIToolCall[] = [];
		const toolResults: OpenAIMessage[] = [];
		const reasoningParts: string[] = [];

		for (const part of message.content ?? []) {
			if (isToolCallPart(part)) {
				toolCalls.push({
					id: part.callId || `call_${Math.random().toString(36).slice(2, 10)}`,
					type: "function",
					function: {
						name: part.name,
						arguments: safeStringify(part.input ?? {})
					}
				});
			} else if (isToolResultPart(part)) {
				toolResults.push({
					role: "tool",
					tool_call_id: part.callId,
					content: collectText(part.content)
				});
			} else if (isImagePart(part)) {
				if (model.vision) {
					imageParts.push({
						type: "image_url",
						image_url: {
							url: createDataUrl(part)
						}
					});
				}
			} else if (isThinkingPart(part)) {
				reasoningParts.push(extractTextValue(part));
			} else if (isTextLikePart(part)) {
				textParts.push(extractTextValue(part));
			}
		}

		const text = textParts.join("");
		const reasoning = reasoningParts.join("").trim();

		if (role === "assistant") {
			const assistant: OpenAIMessage = {
				role: "assistant"
			};
			if (text.trim()) {
				assistant.content = text;
			}
			if (model.includeReasoningInRequest && reasoning) {
				assistant.reasoning_content = reasoning;
			}
			if (toolCalls.length > 0) {
				assistant.tool_calls = toolCalls;
			}
			if (assistant.content || assistant.reasoning_content || assistant.tool_calls) {
				out.push(assistant);
			}
			out.push(...toolResults);
			continue;
		}

		out.push(...toolResults);

		if (!text.trim() && imageParts.length === 0) {
			continue;
		}

		if (role === "user" && imageParts.length > 0) {
			const content: OpenAIContentPart[] = [];
			if (text.trim()) {
				content.push({ type: "text", text });
			}
			content.push(...imageParts);
			out.push({ role, content });
		} else {
			out.push({ role, content: text });
		}
	}

	return out;
}

export function estimateTokens(input: string | LanguageModelChatRequestMessage): number {
	if (typeof input === "string") {
		return estimateTextTokens(input);
	}

	let tokens = 4;
	for (const part of input.content ?? []) {
		if (isImagePart(part)) {
			tokens += 1024;
		} else if (isToolCallPart(part)) {
			tokens += estimateTextTokens(part.name) + estimateTextTokens(safeStringify(part.input ?? {}));
		} else if (isToolResultPart(part)) {
			tokens += estimateTextTokens(collectText(part.content));
		} else if (isTextLikePart(part) || isThinkingPart(part)) {
			tokens += estimateTextTokens(extractTextValue(part));
		}
	}
	return tokens;
}

function mapRole(role: unknown, roleIds: RoleIds): "system" | "user" | "assistant" {
	if (role === roleIds.user) {
		return "user";
	}
	if (role === roleIds.assistant) {
		return "assistant";
	}
	return "system";
}

function estimateTextTokens(text: string): number {
	return Math.max(1, Math.ceil(text.length / 4));
}

function isTextLikePart(value: unknown): value is { value: string | readonly string[] } {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as Record<string, unknown>;
	return "value" in record && (typeof record.value === "string" || Array.isArray(record.value));
}

function isThinkingPart(value: unknown): value is { value: string | readonly string[] } {
	if (!isTextLikePart(value)) {
		return false;
	}
	const name = value.constructor?.name?.toLowerCase() ?? "";
	return name.includes("thinking");
}

function isImagePart(value: unknown): value is { mimeType: string; data: Uint8Array } {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as Record<string, unknown>;
	return typeof record.mimeType === "string"
		&& record.mimeType.startsWith("image/")
		&& record.data instanceof Uint8Array;
}

function isToolCallPart(value: unknown): value is { callId?: string; name: string; input?: unknown } {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as Record<string, unknown>;
	return typeof record.name === "string" && "input" in record;
}

function isToolResultPart(value: unknown): value is { callId: string; content?: readonly unknown[] } {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as Record<string, unknown>;
	return typeof record.callId === "string" && Array.isArray(record.content);
}

function extractTextValue(part: { value: string | readonly string[] }): string {
	return Array.isArray(part.value) ? part.value.join("") : String(part.value);
}

function collectText(content: readonly unknown[] | undefined): string {
	let text = "";
	for (const part of content ?? []) {
		if (typeof part === "string") {
			text += part;
		} else if (isTextLikePart(part)) {
			text += extractTextValue(part);
		} else {
			text += safeStringify(part);
		}
	}
	return text;
}

function createDataUrl(part: { mimeType: string; data: Uint8Array }): string {
	return `data:${part.mimeType};base64,${Buffer.from(part.data).toString("base64")}`;
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return "{}";
	}
}
