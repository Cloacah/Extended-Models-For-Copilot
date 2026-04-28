import test from "node:test";
import assert from "node:assert/strict";
import { convertMessages, estimateTokens } from "../openaiCompat/messages";
import type { ModelConfig } from "../types";

const model: ModelConfig = {
	id: "test-model",
	provider: "test",
	baseUrl: "https://example.com/v1",
	contextLength: 128000,
	maxOutputTokens: 4096,
	vision: true,
	toolCalling: true,
	headers: {},
	extraBody: {},
	includeReasoningInRequest: true,
	editTools: []
};

test("convertMessages emits OpenAI text and image content", () => {
	const messages = [
		{
			role: "user",
			content: [
				{ value: "describe this" },
				{ mimeType: "image/png", data: new Uint8Array([1, 2, 3]) }
			]
		}
	] as any;

	const converted = convertMessages(messages, model, { user: "user", assistant: "assistant" });

	assert.equal(converted.length, 1);
	assert.equal(converted[0].role, "user");
	assert.deepEqual(converted[0].content, [
		{ type: "text", text: "describe this" },
		{ type: "image_url", image_url: { url: "data:image/png;base64,AQID" } }
	]);
});

test("convertMessages emits assistant tool calls and tool results", () => {
	const messages = [
		{
			role: "assistant",
			content: [
				{ value: "I will inspect it." },
				{ callId: "call-1", name: "read_file", input: { path: "a.ts" } }
			]
		},
		{
			role: "user",
			content: [
				{ callId: "call-1", content: [{ value: "file contents" }] }
			]
		}
	] as any;

	const converted = convertMessages(messages, model, { user: "user", assistant: "assistant" });

	assert.equal(converted[0].role, "assistant");
	assert.equal(converted[0].tool_calls?.[0].function.name, "read_file");
	assert.equal(converted[1].role, "tool");
	assert.equal(converted[1].content, "file contents");
});

test("estimateTokens includes image cost", () => {
	const count = estimateTokens({
		role: "user",
		content: [
			{ value: "hello" },
			{ mimeType: "image/png", data: new Uint8Array([1]) }
		]
	} as any);

	assert.ok(count > 1000);
});
