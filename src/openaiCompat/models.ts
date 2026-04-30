import * as vscode from "vscode";
import { getSettings } from "../config/settings";
import { DEFAULT_CONTEXT_LENGTH, DEFAULT_MAX_OUTPUT_TOKENS, PROVIDER_CATALOG } from "../config/presets";
import type { Logger } from "../logger";
import { getApiKey } from "../secrets";
import type { ModelCatalogState, ModelConfig } from "../types";

const CATALOG_KEY = "extendedModels.providerModelCatalog";
const MODEL_LIST_TIMEOUT_MS = 20000;

interface OpenAIModelListResponse {
	data?: Array<{
		id?: unknown;
		owned_by?: unknown;
		ownedBy?: unknown;
	}>;
}

export interface RefreshModelsResult {
	refreshedProviders: string[];
	skippedProviders: string[];
	errors: Record<string, string>;
}

export function readModelCatalogState(context: vscode.ExtensionContext): ModelCatalogState {
	return normalizeState(context.globalState.get<ModelCatalogState>(CATALOG_KEY));
}

export async function refreshConfiguredProviderModels(
	context: vscode.ExtensionContext,
	providers?: readonly string[],
	logger?: Logger
): Promise<RefreshModelsResult> {
	const currentState = readModelCatalogState(context);
	const settings = getSettings(currentState);
	const targetProviders = normalizeProviders(providers ?? settings.models.map((model) => model.provider));
	const nextModels = currentState.models.filter((model) => !targetProviders.includes(normalizeProvider(model.provider)));
	const nextRefreshedProviders = new Set(currentState.refreshedProviders.map(normalizeProvider));
	const errors = { ...(currentState.errors ?? {}) };
	const refreshedProviders: string[] = [];
	const skippedProviders: string[] = [];

	for (const provider of targetProviders) {
		try {
			const models = await fetchProviderModels(context, provider, settings.models);
			if (models.length === 0) {
				throw new Error("Provider returned no models.");
			}
			nextModels.push(...models);
			nextRefreshedProviders.add(provider);
			delete errors[provider];
			refreshedProviders.push(provider);
			logger?.info("models.refresh.provider", { provider, count: models.length });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message === "Missing provider API key.") {
				delete errors[provider];
				skippedProviders.push(provider);
				logger?.debug("models.refresh.skipped", { provider, reason: message });
				continue;
			}
			errors[provider] = message;
			skippedProviders.push(provider);
			logger?.warn("models.refresh.failed", { provider, message });
		}
	}

	const nextState: ModelCatalogState = {
		models: nextModels,
		refreshedProviders: Array.from(nextRefreshedProviders).filter((provider) =>
			nextModels.some((model) => normalizeProvider(model.provider) === provider)
		),
		updatedAt: Date.now(),
		errors
	};
	await context.globalState.update(CATALOG_KEY, nextState);

	return {
		refreshedProviders,
		skippedProviders,
		errors
	};
}

export async function clearProviderModelCache(context: vscode.ExtensionContext, providers: readonly string[]): Promise<void> {
	const normalizedProviders = normalizeProviders(providers);
	if (normalizedProviders.length === 0) {
		return;
	}
	const currentState = readModelCatalogState(context);
	await context.globalState.update(CATALOG_KEY, {
		models: currentState.models.filter((model) => !normalizedProviders.includes(normalizeProvider(model.provider))),
		refreshedProviders: currentState.refreshedProviders.filter((provider) => !normalizedProviders.includes(normalizeProvider(provider))),
		updatedAt: Date.now(),
		errors: Object.fromEntries(Object.entries(currentState.errors ?? {}).filter(([provider]) => !normalizedProviders.includes(normalizeProvider(provider))))
	} satisfies ModelCatalogState);
}

async function fetchProviderModels(
	context: vscode.ExtensionContext,
	provider: string,
	allModels: readonly ModelConfig[]
): Promise<ModelConfig[]> {
	const template = allModels.find((model) => normalizeProvider(model.provider) === provider) ?? createGenericTemplate(provider);
	const apiKey = await getApiKey(context.secrets, template);
	if (!apiKey) {
		throw new Error("Missing provider API key.");
	}
	if (!template.baseUrl) {
		throw new Error("Missing provider base URL.");
	}

	const endpoint = `${template.baseUrl.replace(/\/+$/, "")}/models`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS);
	try {
		const response = await fetch(endpoint, {
			method: "GET",
			headers: {
				"Accept": "application/json",
				"Authorization": `Bearer ${apiKey}`,
				...template.headers
			},
			signal: controller.signal
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} while fetching ${endpoint}.`);
		}

		const json = await response.json() as OpenAIModelListResponse;
		const ids = Array.from(new Set((json.data ?? [])
			.map((item) => typeof item.id === "string" ? item.id.trim() : "")
			.filter(Boolean)));
		return ids.map((id) => createDiscoveredModel(provider, id, allModels));
	} finally {
		clearTimeout(timeout);
	}
}

function createDiscoveredModel(provider: string, id: string, allModels: readonly ModelConfig[]): ModelConfig {
	const normalizedProvider = normalizeProvider(provider);
	const existing = allModels.find((model) => normalizeProvider(model.provider) === normalizedProvider && model.id === id);
	if (existing) {
		return { ...existing, builtIn: true };
	}

	const providerSeed = PROVIDER_CATALOG.find((item) => item.provider === normalizedProvider);
	const template = allModels.find((model) => normalizeProvider(model.provider) === normalizedProvider) ?? createGenericTemplate(provider);
	const hints = template.parameterHints;
	return {
		...template,
		id,
		displayName: id,
		configId: undefined,
		provider: normalizedProvider,
		providerDisplayName: providerSeed?.providerDisplayName ?? template.providerDisplayName ?? normalizedProvider,
		category: "Discovered",
		contextLength: template.contextLength || DEFAULT_CONTEXT_LENGTH,
		maxOutputTokens: template.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
		temperature: hints?.temperature?.recommended ?? template.temperature,
		topP: hints?.topP?.recommended ?? template.topP,
		reasoningEffort: hints?.reasoningEffort?.recommended ?? template.reasoningEffort,
		thinking: hints?.thinking?.recommended ? { type: hints.thinking.recommended as "enabled" | "disabled" } : template.thinking,
		builtIn: true
	};
}

function createGenericTemplate(provider: string): ModelConfig {
	const normalizedProvider = normalizeProvider(provider);
	const providerSeed = PROVIDER_CATALOG.find((item) => item.provider === normalizedProvider);
	return {
		id: "model",
		provider: normalizedProvider,
		providerDisplayName: providerSeed?.providerDisplayName ?? normalizedProvider,
		baseUrl: providerSeed?.baseUrl,
		family: "oai-compatible",
		contextLength: DEFAULT_CONTEXT_LENGTH,
		maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
		vision: false,
		toolCalling: true,
		headers: {},
		extraBody: {},
		includeReasoningInRequest: false,
		editTools: [],
		parameterHints: providerSeed?.hints,
		documentationUrl: providerSeed?.documentationUrl,
		builtIn: true
	};
}

function normalizeState(value: unknown): ModelCatalogState {
	if (!value || typeof value !== "object") {
		return { models: [], refreshedProviders: [], updatedAt: 0, errors: {} };
	}
	const state = value as Partial<ModelCatalogState>;
	return {
		models: Array.isArray(state.models) ? state.models : [],
		refreshedProviders: Array.isArray(state.refreshedProviders) ? state.refreshedProviders.filter((item): item is string => typeof item === "string") : [],
		updatedAt: typeof state.updatedAt === "number" ? state.updatedAt : 0,
		errors: state.errors && typeof state.errors === "object" ? state.errors : {}
	};
}

function normalizeProviders(providers: readonly string[]): string[] {
	return Array.from(new Set(providers.map(normalizeProvider).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function normalizeProvider(provider: string): string {
	return provider.trim().toLowerCase();
}
