import test from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_PRESETS } from "../config/presets";

test("built-in presets include official provider families", () => {
	const providers = new Set(BUILT_IN_PRESETS.map((model) => model.provider));

	for (const provider of ["deepseek", "zhipu", "minimax", "kimi", "qwen"]) {
		assert.equal(providers.has(provider), true);
	}

	assert.ok(BUILT_IN_PRESETS.some((model) => model.id === "kimi-k2.6" && model.vision));
	assert.ok(BUILT_IN_PRESETS.some((model) => model.id === "MiniMax-M2.7" && model.extraBody.reasoning_split === true));
	assert.ok(BUILT_IN_PRESETS.some((model) => model.id === "qwen3-coder-plus"));
	assert.ok(BUILT_IN_PRESETS.some((model) => model.id === "deepseek-v4-pro" && model.maxOutputTokens >= 32768 && model.contextLength === 1048576 && !model.vision));
	assert.deepEqual(BUILT_IN_PRESETS.find((model) => model.id === "deepseek-v4-pro")?.parameterHints?.reasoningEffort?.options, ["high", "max"]);
	assert.ok(BUILT_IN_PRESETS.every((model) => model.parameterHints));
});
