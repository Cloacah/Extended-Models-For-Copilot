import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIStreamParser, parseToolArguments } from "../openaiCompat/sse";
import type { StreamEvent } from "../types";

test("OpenAIStreamParser parses text, thinking, and tool calls", async () => {
	const stream = toStream([
		`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "think" } }] })}\n\n`,
		`data: ${JSON.stringify({ choices: [{ delta: { content: "hello" } }] })}\n\n`,
		`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "read_file", arguments: "{\"path\"" } }] } }] })}\n\n`,
		`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ":\"a.ts\"}" } }] }, finish_reason: "tool_calls" }] })}\n\n`,
		"data: [DONE]\n\n"
	]);
	const events: StreamEvent[] = [];
	const parser = new OpenAIStreamParser();

	await parser.parse(stream, (event) => {
		events.push(event);
	});

	assert.equal(events[0].type, "thinking");
	assert.equal(events[1].type, "text");
	assert.deepEqual(events[2], {
		type: "tool_call",
		id: "call-1",
		name: "read_file",
		input: { path: "a.ts" }
	});
});

test("parseToolArguments rejects non-object JSON", () => {
	assert.equal(parseToolArguments("[]"), undefined);
	assert.deepEqual(parseToolArguments("{\"ok\":true}"), { ok: true });
});

function toStream(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		}
	});
}
