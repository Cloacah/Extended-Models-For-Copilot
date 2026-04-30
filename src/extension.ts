import * as vscode from "vscode";
import { getSettings, listProviders } from "./config/settings";
import { Logger } from "./logger";
import { clearApiKey, promptForApiKey, providerSecretKey, setDefaultApiKey } from "./secrets";
import { ConfigPanel } from "./ui/configPanel";
import { ExtendedModelsProvider } from "./provider";
import { clearProviderModelCache, readModelCatalogState, refreshConfiguredProviderModels } from "./openaiCompat/models";
import { openGlobalPromptPresetFolder, selectPromptPreset } from "./promptPresets";

let logger: Logger | undefined;

export function activate(context: vscode.ExtensionContext): void {
	logger = new Logger();
	let catalogState = readModelCatalogState(context);
	logger.setLevel(getSettings(catalogState).logLevel);

	const provider = new ExtendedModelsProvider(context, context.secrets, logger, () => getSettings(catalogState));
	const refreshModels = async (providers?: readonly string[], showResult = false): Promise<void> => {
		const result = await refreshConfiguredProviderModels(context, providers, logger);
		catalogState = readModelCatalogState(context);
		provider.refreshModels();
		if (showResult) {
			const refreshed = result.refreshedProviders.length;
			const failed = result.skippedProviders.length;
			vscode.window.showInformationMessage(`Copilot Bro refreshed ${refreshed} provider(s), ${failed} failed/skipped.`);
		}
	};
	context.subscriptions.push(
		logger,
		provider,
		vscode.lm.registerLanguageModelChatProvider("extendedModels", provider),
		vscode.commands.registerCommand("extendedModels.manage", () => ConfigPanel.open(context)),
		vscode.commands.registerCommand("extendedModels.openModelSettings", () => ConfigPanel.open(context)),
		vscode.commands.registerCommand("extendedModels.setApiKey", () => setDefaultApiKey(context.secrets)),
		vscode.commands.registerCommand("extendedModels.setProviderApiKey", async () => {
			const changedProvider = await setProviderApiKey(context);
			if (changedProvider) {
				await refreshModels([changedProvider], true);
			}
		}),
		vscode.commands.registerCommand("extendedModels.clearApiKey", async () => {
			await clearSelectedApiKey(context);
			catalogState = readModelCatalogState(context);
			provider.refreshModels();
		}),
		vscode.commands.registerCommand("extendedModels.showOutput", () => logger?.show()),
		vscode.commands.registerCommand("extendedModels.exportModels", () => exportModels()),
		vscode.commands.registerCommand("extendedModels.importModels", () => importModels()),
		vscode.commands.registerCommand("extendedModels.refreshProviderModels", () => refreshModels(undefined, true)),
		vscode.commands.registerCommand("extendedModels.selectPromptPreset", () => selectPromptPreset(context)),
		vscode.commands.registerCommand("extendedModels.openPromptPresetFolder", () => openGlobalPromptPresetFolder(context)),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration("extendedModels.logLevel")) {
				logger?.setLevel(getSettings(catalogState).logLevel);
			}
			if (event.affectsConfiguration("extendedModels")) {
				provider.refreshModels();
			}
		})
	);

	logger.info("extension.activated");
	void refreshModels(undefined).catch((error) => logger?.warn("models.refresh.startup.failed", {
		message: error instanceof Error ? error.message : String(error)
	}));
}

async function exportModels(): Promise<void> {
	const uri = await vscode.window.showSaveDialog({
		title: "Export Copilot Bro Model Configuration",
		defaultUri: vscode.Uri.file("copilot-bro-models.json"),
		filters: {
			"JSON": [
				"json"
			]
		}
	});
	if (!uri) {
		return;
	}

	const config = vscode.workspace.getConfiguration("extendedModels");
	const models = config.get<unknown[]>("models", []);
	const content = JSON.stringify({ models: models.map((model) => removeSensitiveFields(model)) }, null, 2);
	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
	vscode.window.showInformationMessage("Copilot Bro configuration exported.");
}

async function importModels(): Promise<void> {
	const uris = await vscode.window.showOpenDialog({
		title: "Import Copilot Bro Model Configuration",
		canSelectMany: false,
		filters: {
			"JSON": [
				"json"
			]
		}
	});
	const uri = uris?.[0];
	if (!uri) {
		return;
	}

	const bytes = await vscode.workspace.fs.readFile(uri);
	const text = new TextDecoder().decode(bytes);
	const parsed = JSON.parse(text) as unknown;
	const models = Array.isArray(parsed) ? parsed : (parsed as { models?: unknown }).models;
	if (!Array.isArray(models)) {
		throw new Error("Imported file must be a JSON array or an object with a models array.");
	}

	await vscode.workspace.getConfiguration("extendedModels").update("models", models, vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage("Copilot Bro configuration imported.");
}

function removeSensitiveFields(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => removeSensitiveFields(item));
	}
	if (!value || typeof value !== "object") {
		return value;
	}
	const out: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (!isSensitiveKey(key)) {
			out[key] = removeSensitiveFields(item);
		}
	}
	return out;
}

function isSensitiveKey(key: string): boolean {
	const normalized = key.toLowerCase();
	return normalized.includes("authorization")
		|| normalized.includes("api-key")
		|| normalized.includes("apikey")
		|| normalized.includes("api_key")
		|| normalized.includes("token")
		|| normalized.includes("secret")
		|| normalized.includes("password")
		|| normalized === "cookie";
}

export function deactivate(): void {
	logger?.dispose();
	logger = undefined;
}

async function setProviderApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
	const providers = getProviderChoices();
	const provider = await vscode.window.showQuickPick(providers, {
		title: "Copilot Bro: Select Provider",
		placeHolder: "Choose the provider whose API key should be updated"
	});
	if (!provider) {
		return undefined;
	}

	const existing = await context.secrets.get(providerSecretKey(provider));
	const saved = await promptForApiKey(context.secrets, provider, existing);
	if (saved === "") {
		vscode.window.showInformationMessage(`Copilot Bro API key for ${provider} cleared.`);
	} else if (saved) {
		vscode.window.showInformationMessage(`Copilot Bro API key for ${provider} saved.`);
	}
	return saved === undefined ? undefined : provider;
}

async function clearSelectedApiKey(context: vscode.ExtensionContext): Promise<void> {
	const choices = [
		"Default",
		...getProviderChoices()
	];
	const selected = await vscode.window.showQuickPick(choices, {
		title: "Copilot Bro: Clear API Key"
	});
	if (!selected) {
		return;
	}
	await clearApiKey(context.secrets, selected === "Default" ? undefined : selected);
	if (selected !== "Default") {
		await clearProviderModelCache(context, [selected]);
	}
	vscode.window.showInformationMessage(`Copilot Bro API key for ${selected} cleared.`);
}

function getProviderChoices(): string[] {
	const settings = getSettings();
	const providers = listProviders(settings.models);
	if (providers.length > 0) {
		return providers;
	}
	return [
		"deepseek",
		"zhipu",
		"minimax",
		"kimi",
		"qwen"
	];
}
