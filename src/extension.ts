import * as vscode from "vscode";
import { getSettings, listProviders } from "./config/settings";
import { Logger } from "./logger";
import { clearApiKey, promptForApiKey, providerSecretKey, setDefaultApiKey } from "./secrets";
import { ConfigPanel } from "./ui/configPanel";
import { ExtendedModelsProvider } from "./provider";

let logger: Logger | undefined;

export function activate(context: vscode.ExtensionContext): void {
	logger = new Logger();
	logger.setLevel(getSettings().logLevel);

	const provider = new ExtendedModelsProvider(context.secrets, logger);
	context.subscriptions.push(
		logger,
		vscode.lm.registerLanguageModelChatProvider("extendedModels", provider),
		vscode.commands.registerCommand("extendedModels.manage", () => ConfigPanel.open(context)),
		vscode.commands.registerCommand("extendedModels.setApiKey", () => setDefaultApiKey(context.secrets)),
		vscode.commands.registerCommand("extendedModels.setProviderApiKey", () => setProviderApiKey(context)),
		vscode.commands.registerCommand("extendedModels.clearApiKey", () => clearSelectedApiKey(context)),
		vscode.commands.registerCommand("extendedModels.showOutput", () => logger?.show()),
		vscode.commands.registerCommand("extendedModels.exportModels", () => exportModels()),
		vscode.commands.registerCommand("extendedModels.importModels", () => importModels()),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration("extendedModels.logLevel")) {
				logger?.setLevel(getSettings().logLevel);
			}
		})
	);

	logger.info("extension.activated");
}

async function exportModels(): Promise<void> {
	const uri = await vscode.window.showSaveDialog({
		title: "Export Extended Models Configuration",
		defaultUri: vscode.Uri.file("extended-models.json"),
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
	vscode.window.showInformationMessage("Extended Models configuration exported.");
}

async function importModels(): Promise<void> {
	const uris = await vscode.window.showOpenDialog({
		title: "Import Extended Models Configuration",
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
	vscode.window.showInformationMessage("Extended Models configuration imported.");
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

async function setProviderApiKey(context: vscode.ExtensionContext): Promise<void> {
	const providers = getProviderChoices();
	const provider = await vscode.window.showQuickPick(providers, {
		title: "Extended Models: Select Provider",
		placeHolder: "Choose the provider whose API key should be updated"
	});
	if (!provider) {
		return;
	}

	const existing = await context.secrets.get(providerSecretKey(provider));
	const saved = await promptForApiKey(context.secrets, provider, existing);
	if (saved === "") {
		vscode.window.showInformationMessage(`Extended Models API key for ${provider} cleared.`);
	} else if (saved) {
		vscode.window.showInformationMessage(`Extended Models API key for ${provider} saved.`);
	}
}

async function clearSelectedApiKey(context: vscode.ExtensionContext): Promise<void> {
	const choices = [
		"Default",
		...getProviderChoices()
	];
	const selected = await vscode.window.showQuickPick(choices, {
		title: "Extended Models: Clear API Key"
	});
	if (!selected) {
		return;
	}
	await clearApiKey(context.secrets, selected === "Default" ? undefined : selected);
	vscode.window.showInformationMessage(`Extended Models API key for ${selected} cleared.`);
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
		"kimi",
		"qwen"
	];
}
