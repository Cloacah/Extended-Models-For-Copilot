import { createHash } from "node:crypto";
import type { OpenAIMessage } from "./types";

export interface ReasoningCacheEntry {
	fingerprint: string;
	reasoning: string;
}

const CACHE_KEY = "extendedModels.reasoningCache.v1";
const VSCODE_TOOL_CALL_SUFFIX_PATTERN = /__vscode-\d+$/;

export class ReasoningCache {
	private entries: ReasoningCacheEntry[] = [];

	constructor(private readonly maxEntries = 512) {}

	restore(value: unknown): void {
		if (!Array.isArray(value)) {
			return;
		}
		this.entries = value
			.filter((entry): entry is ReasoningCacheEntry =>
				Boolean(entry)
				&& typeof entry.fingerprint === "string"
				&& typeof entry.reasoning === "string"
				&& entry.reasoning.trim().length > 0
			)
			.slice(-this.maxEntries);
	}

	serialize(): ReasoningCacheEntry[] {
		return this.entries.map((entry) => ({ ...entry }));
	}

	set(fingerprint: string, reasoning: string): void {
		if (!fingerprint || !reasoning.trim()) {
			return;
		}
		const existing = this.entries.findIndex((entry) => entry.fingerprint === fingerprint);
		if (existing !== -1) {
			this.entries.splice(existing, 1);
		}
		this.entries.push({ fingerprint, reasoning });
		while (this.entries.length > this.maxEntries) {
			this.entries.shift();
		}
	}

	get(fingerprint: string): string | undefined {
		if (!fingerprint) {
			return undefined;
		}
		const index = this.entries.findIndex((entry) => entry.fingerprint === fingerprint);
		if (index === -1) {
			return undefined;
		}
		const [entry] = this.entries.splice(index, 1);
		this.entries.push(entry);
		return entry.reasoning;
	}
}

export function readReasoningCache(state: { globalState: { get<T>(key: string): T | undefined } }): ReasoningCache {
	const cache = new ReasoningCache();
	cache.restore(state.globalState.get<ReasoningCacheEntry[]>(CACHE_KEY));
	return cache;
}

export async function writeReasoningCache(
	state: { globalState: { update(key: string, value: unknown): Thenable<void> } },
	cache: ReasoningCache
): Promise<void> {
	await state.globalState.update(CACHE_KEY, cache.serialize());
}

export function fingerprintAssistantTurn(message: OpenAIMessage): string {
	if (message.role !== "assistant") {
		return "";
	}
	const toolCalls = message.tool_calls ?? [];
	if (toolCalls.length > 0) {
		const key = toolCalls
			.map((toolCall) => `${toolCall.function.name}:${normalizeToolCallId(toolCall.id)}`)
			.sort()
			.join("|");
		return key ? `tc:${hash(key)}` : "";
	}
	const text = typeof message.content === "string"
		? message.content.normalize("NFKC").replace(/\s+/g, " ").trim()
		: "";
	return text ? `tx:${hash(text)}` : "";
}

function normalizeToolCallId(callId: string | undefined): string {
	return callId?.replace(VSCODE_TOOL_CALL_SUFFIX_PATTERN, "") ?? "";
}

function hash(text: string): string {
	return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
