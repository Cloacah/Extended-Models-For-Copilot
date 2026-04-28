import test from "node:test";
import assert from "node:assert/strict";
import { buildHeaders, buildRequestBody } from "../openaiCompat/request";
import type { ModelConfig } from "../types";

const model: ModelConfig = {
	id: "deepseek-v4-pro",
	provider: "deepseek",
	baseUrl: "https://api.deepseek.com",
	contextLength: 128000,
	maxOutputTokens: 8192,
	vision: false,
	toolCalling: true,
	temperature: 1,
	topP: 1,
	reasoningEffort: "high",
	thinking: { type: "enabled" },
	headers: { "X-Test": "1" },
	extraBody: { seed: 42 },
	includeReasoningInRequest: false,
	editTools: []
};

test("buildRequestBody includes model options, tools, and extra body", () => {
	const body = buildRequestBody(
		model,
		[{ role: "user", content: "hello" }],
		{
			tools: [
				{
					name: "read_file",
					description: "Read a file",
					inputSchema: { type: "object" }
				}
			]
		},
		"read_file"
	);

	assert.equal(body.model, "deepseek-v4-pro");
	assert.equal(body.stream, true);
	assert.equal(body.temperature, 1);
	assert.equal(body.top_p, 1);
	assert.equal(body.reasoning_effort, "high");
	assert.deepEqual(body.thinking, { type: "enabled" });
	assert.equal(body.seed, 42);
	assert.equal(body.tools?.[0].function.name, "read_file");
	assert.deepEqual(body.tool_choice, { type: "function", function: { name: "read_file" } });
});

test("buildHeaders merges custom headers", () => {
	const headers = buildHeaders("secret", model);

	assert.equal(headers.Authorization, "Bearer secret");
	assert.equal(headers["X-Test"], "1");
	assert.equal(headers.Accept, "text/event-stream");
});

test("Kimi uses auto tool choice because required is not supported", () => {
	const body = buildRequestBody(
		{ ...model, provider: "kimi", id: "kimi-k2.6" },
		[{ role: "user", content: "hello" }],
		{ tools: [{ name: "read_file", description: "Read a file", inputSchema: { type: "object" } }] },
		"read_file"
	);

	assert.equal(body.tool_choice, "auto");
});
