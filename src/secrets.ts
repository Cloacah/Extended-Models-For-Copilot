import * as vscode from "vscode";
import type { ModelConfig } from "./types";

const DEFAULT_KEY = "extendedModels.apiKey";

export function providerSecretKey(provider: string): string {
	return `extendedModels.apiKey.${provider.trim().toLowerCase()}`;
}

export async function getApiKey(secrets: vscode.SecretStorage, model: ModelConfig): Promise<string | undefined> {
	const providerKey = providerSecretKey(model.provider);
	return await secrets.get(providerKey) ?? await secrets.get(DEFAULT_KEY);
}

export async function promptForApiKey(
	secrets: vscode.SecretStorage,
	provider?: string,
	existing?: string
): Promise<string | undefined> {
	const normalizedProvider = provider?.trim().toLowerCase();
	const key = normalizedProvider ? providerSecretKey(normalizedProvider) : DEFAULT_KEY;
	const title = normalizedProvider ? `API Key for ${normalizedProvider}` : "Default API Key";
	const value = await vscode.window.showInputBox({
		title: `Extended Models: ${title}`,
		prompt: existing ? "Update API key. Leave empty to clear it." : "Enter API key. It will be stored in VS Code SecretStorage.",
		ignoreFocusOut: true,
		password: true
	});

	if (value === undefined) {
		return undefined;
	}

	if (!value.trim()) {
		await secrets.delete(key);
		return "";
	}

	const trimmed = value.trim();
	await secrets.store(key, trimmed);
	return trimmed;
}

export async function ensureApiKey(secrets: vscode.SecretStorage, model: ModelConfig): Promise<string | undefined> {
	const existing = await getApiKey(secrets, model);
	if (existing) {
		return existing;
	}

	const entered = await promptForApiKey(secrets, model.provider);
	return entered || undefined;
}

export async function clearApiKey(secrets: vscode.SecretStorage, provider?: string): Promise<void> {
	if (provider?.trim()) {
		await secrets.delete(providerSecretKey(provider));
	} else {
		await secrets.delete(DEFAULT_KEY);
	}
}

export async function setDefaultApiKey(secrets: vscode.SecretStorage): Promise<void> {
	const existing = await secrets.get(DEFAULT_KEY);
	const saved = await promptForApiKey(secrets, undefined, existing);
	if (saved === "") {
		vscode.window.showInformationMessage("Extended Models default API key cleared.");
	} else if (saved) {
		vscode.window.showInformationMessage("Extended Models default API key saved.");
	}
}
