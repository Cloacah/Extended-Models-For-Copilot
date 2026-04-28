import test from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_PRESETS } from "../config/presets";

test("built-in presets include official provider families", () => {
	const providers = new Set(BUILT_IN_PRESETS.map((model) => model.provider));

	for (const provider of ["deepseek", "zhipu", "kimi", "qwen"]) {
		assert.equal(providers.has(provider), true);
	}

	assert.ok(BUILT_IN_PRESETS.some((model) => model.id === "kimi-k2.6" && model.vision));
	assert.ok(BUILT_IN_PRESETS.some((model) => model.id === "qwen3-coder-plus"));
	assert.ok(BUILT_IN_PRESETS.every((model) => model.parameterHints));
});
