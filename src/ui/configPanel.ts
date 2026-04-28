import * as vscode from "vscode";
import { getSettings } from "../config/settings";
import { getRuntimeModelId, listProviders } from "../config/settings";
import { providerSecretKey } from "../secrets";
import type { ModelConfig } from "../types";

export class ConfigPanel {
	static async open(context: vscode.ExtensionContext): Promise<void> {
		const panel = vscode.window.createWebviewPanel(
			"extendedModelsConfig",
			"Extended Models Configuration",
			vscode.ViewColumn.Active,
			{
				enableScripts: true
			}
		);

		panel.webview.html = await renderHtml(panel.webview, context);
		panel.webview.onDidReceiveMessage(async (message: unknown) => {
			if (!message || typeof message !== "object") {
				return;
			}
			const command = (message as Record<string, unknown>).command;
			if (command === "openSettings") {
				await vscode.commands.executeCommand("workbench.action.openSettingsJson");
			} else if (command === "setProviderKey") {
				await vscode.commands.executeCommand("extendedModels.setProviderApiKey");
				panel.webview.html = await renderHtml(panel.webview, context);
			} else if (command === "exportModels") {
				await vscode.commands.executeCommand("extendedModels.exportModels");
			} else if (command === "importModels") {
				await vscode.commands.executeCommand("extendedModels.importModels");
			} else if (command === "showOutput") {
				await vscode.commands.executeCommand("extendedModels.showOutput");
			} else if (command === "saveModel") {
				await saveModel((message as { model?: unknown }).model);
			} else if (command === "saveCustomModel") {
				await saveModel((message as { model?: unknown }).model);
				panel.webview.html = await renderHtml(panel.webview, context);
			}
		});
	}
}

async function saveModel(value: unknown): Promise<void> {
	if (!value || typeof value !== "object") {
		return;
	}
	const model = value as Partial<ModelConfig>;
	if (!model.id || !model.provider || !model.baseUrl) {
		throw new Error("Model id, provider, and baseUrl are required.");
	}
	delete model.builtIn;
	model.headers = removeSensitiveStringRecord(model.headers);
	model.extraBody = removeSensitiveObject(model.extraBody);
	const current = vscode.workspace.getConfiguration("extendedModels").get<unknown[]>("models", []);
	const targetId = getRuntimeModelId(model as Pick<ModelConfig, "id" | "configId" | "provider">);
	const next = current.filter((item) => {
		if (!item || typeof item !== "object") {
			return true;
		}
		const candidate = item as Partial<ModelConfig>;
		if (!candidate.id || !candidate.provider) {
			return true;
		}
		return getRuntimeModelId(candidate as Pick<ModelConfig, "id" | "configId" | "provider">) !== targetId;
	});
	next.push(model);
	await vscode.workspace.getConfiguration("extendedModels").update("models", next, vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage(`Saved model ${model.displayName ?? model.id}. API keys remain in local SecretStorage only.`);
}

function removeSensitiveStringRecord(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object") {
		return {};
	}
	const out: Record<string, string> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (typeof item === "string" && !isSensitiveKey(key)) {
			out[key] = item;
		}
	}
	return out;
}

function removeSensitiveObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object") {
		return {};
	}
	const out: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (!isSensitiveKey(key)) {
			out[key] = item;
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

async function renderHtml(webview: vscode.Webview, context: vscode.ExtensionContext): Promise<string> {
	const nonce = getNonce();
	const settings = getSettings();
	const providers = listProviders(settings.models);
	const keyedProviders = await getKeyedProviders(context.secrets, providers);
	const hasDefaultKey = Boolean(await context.secrets.get("extendedModels.apiKey"));
	const presets = settings.models.map((preset) => ({
		id: preset.id,
		displayName: preset.displayName,
		provider: preset.provider,
		providerDisplayName: preset.providerDisplayName,
		category: preset.category,
		baseUrl: preset.baseUrl,
		contextLength: preset.contextLength,
		maxOutputTokens: preset.maxOutputTokens,
		toolCalling: preset.toolCalling,
		vision: preset.vision,
		temperature: preset.temperature,
		topP: preset.topP,
		reasoningEffort: preset.reasoningEffort,
		thinking: preset.thinking,
		parameterHints: preset.parameterHints,
		documentationUrl: preset.documentationUrl,
		editTools: preset.editTools
	}));
	const providerNames = Array.from(new Set(presets.map((preset) => preset.provider)));

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Extended Models</title>
	<style>
		body { font-family: var(--vscode-font-family); padding: 18px; color: var(--vscode-foreground); max-width: 1080px; }
		button, select, input { margin: 4px 8px 8px 0; }
		button { padding: 5px 10px; }
		label { display: block; margin-top: 8px; font-weight: 600; }
		input, select { min-width: 260px; padding: 4px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
		input[type="checkbox"] { min-width: auto; margin-right: 6px; vertical-align: middle; }
		label.check { display: flex; align-items: center; gap: 4px; font-weight: 600; min-height: 28px; }
		pre { background: var(--vscode-textCodeBlock-background); padding: 12px; overflow: auto; }
		.card { border: 1px solid var(--vscode-panel-border); padding: 12px; margin-bottom: 14px; border-radius: 4px; }
		.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
		.row { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
		.muted { color: var(--vscode-descriptionForeground); }
		.small { font-size: 12px; }
	</style>
</head>
<body>
	<h1>Extended Models for Copilot</h1>
	<div class="card">
		<p>Use this provider from Copilot Chat's model picker. Built-in presets are currently <strong>${settings.includeBuiltInPresets ? "enabled" : "disabled"}</strong>.</p>
		<p class="muted">Configured providers: ${providers.length > 0 ? providers.map((provider) => `${keyedProviders.includes(provider) ? "✓ " : ""}${provider}`).join(", ") : "none"}${hasDefaultKey ? " · default API key set" : ""}</p>
		<button id="settings">Open Settings JSON</button>
		<button id="key">Set Provider API Key</button>
		<button id="export">Export Models</button>
		<button id="import">Import Models</button>
		<button id="output">Show Diagnostics Output</button>
	</div>
	<div class="card">
		<h2>Provider Model Editor</h2>
		<p class="muted">Select an official preset, tune common parameters, then save it as a local override. API keys are never stored here.</p>
		<div class="row">
			<div>
				<label for="provider">Provider</label>
				<select id="provider">${providerNames.map((provider) => `<option value="${escapeHtml(provider)}">${escapeHtml(`${keyedProviders.includes(provider) ? "✓ " : ""}${provider}`)}</option>`).join("")}</select>
			</div>
			<div>
				<label for="model">Model</label>
				<select id="model"></select>
			</div>
		</div>
		<div class="grid">
			<div>
				<label for="baseUrl">Base URL</label>
				<input id="baseUrl">
			</div>
			<div>
				<label for="displayName">Display Name</label>
				<input id="displayName">
			</div>
			<div>
				<label for="temperature">Temperature</label>
				<input id="temperature" type="number">
				<div id="temperatureHint" class="muted small"></div>
			</div>
			<div>
				<label for="topP">Top P</label>
				<input id="topP" type="number">
				<div id="topPHint" class="muted small"></div>
			</div>
			<div>
				<label for="maxOutputTokens">Max Output Tokens</label>
				<input id="maxOutputTokens" type="number">
				<div id="maxOutputTokensHint" class="muted small"></div>
			</div>
			<div>
				<label for="thinking">Thinking</label>
				<select id="thinking"></select>
			</div>
			<div>
				<label for="reasoningEffort">Reasoning Effort</label>
				<select id="reasoningEffort"></select>
			</div>
			<div>
				<label class="check"><input id="vision" type="checkbox"> Vision Input</label>
				<label class="check"><input id="toolCalling" type="checkbox"> Tool Calling / Agent</label>
			</div>
		</div>
		<button id="save">Save Local Model Override</button>
		<div id="doc" class="muted small"></div>
	</div>
	<div class="card">
		<h2>Official Presets</h2>
		<p class="muted">${presets.length} presets across DeepSeek, Zhipu, Kimi, and Qwen.</p>
	</div>
	<div class="card">
		<h2>Add Custom Provider / Model</h2>
		<div class="grid">
			<div><label for="customProvider">Provider Key</label><input id="customProvider" placeholder="my-provider"></div>
			<div><label for="customModelId">Model ID</label><input id="customModelId" placeholder="my-model"></div>
			<div><label for="customDisplayName">Display Name</label><input id="customDisplayName" placeholder="My Model"></div>
			<div><label for="customBaseUrl">Base URL</label><input id="customBaseUrl" placeholder="https://example.com/v1"></div>
			<div><label for="customContext">Context Length</label><input id="customContext" type="number" value="128000"></div>
			<div><label for="customMaxOutput">Max Output Tokens</label><input id="customMaxOutput" type="number" value="4096"></div>
			<div><label class="check"><input id="customVision" type="checkbox"> Vision Input</label><label class="check"><input id="customToolCalling" type="checkbox" checked> Tool Calling / Agent</label></div>
		</div>
		<button id="saveCustom">Add Custom Model</button>
		<p class="muted small">After saving, set its API key with "Set Provider API Key". Keys stay in local SecretStorage only.</p>
		<pre>${escapeHtml(`{
	"extendedModels.models": [
		{
			"id": "my-model",
			"displayName": "My Model",
			"provider": "my-provider",
			"baseUrl": "https://example.com/v1",
			"contextLength": 128000,
			"maxOutputTokens": 4096,
			"toolCalling": true,
			"vision": false
		}
	]
}`)}</pre>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const presets = ${JSON.stringify(presets)};
		const byProvider = presets.reduce((a, p) => ((a[p.provider] ||= []).push(p), a), {});
		const $ = id => document.getElementById(id);
		function setOptions(select, values, selected) {
			select.innerHTML = values.map(v => '<option value="' + String(v).replaceAll('"', '&quot;') + '">' + v + '</option>').join('');
			if (selected) select.value = selected;
		}
		function hintText(h) { return h ? 'range ' + h.min + '-' + h.max + ', recommended ' + h.recommended : ''; }
		function selectedProvider() { return $("provider").value.replace(/^✓\\s*/, ""); }
		function currentPreset() { return (byProvider[selectedProvider()] || [])[Number($("model").value) || 0]; }
		function refreshModels() {
			const models = byProvider[selectedProvider()] || [];
			$("model").innerHTML = models.map((m, i) => '<option value="' + i + '">' + (m.displayName || m.id) + (m.category ? ' · ' + m.category : '') + '</option>').join('');
			refreshForm();
		}
		function refreshForm() {
			const m = currentPreset();
			if (!m) return;
			$("baseUrl").value = m.baseUrl || "";
			$("displayName").value = m.displayName || m.id;
			$("temperature").value = m.temperature ?? "";
			$("topP").value = m.topP ?? "";
			$("maxOutputTokens").value = m.maxOutputTokens || 4096;
			$("vision").checked = !!m.vision;
			$("toolCalling").checked = m.toolCalling !== false;
			const hints = m.parameterHints || {};
			for (const [id, key] of [["temperatureHint","temperature"],["topPHint","topP"],["maxOutputTokensHint","maxOutputTokens"]]) $(id).textContent = hintText(hints[key]);
			setOptions($("thinking"), (hints.thinking && hints.thinking.options) || ["disabled", "enabled"], (m.thinking && m.thinking.type) || (hints.thinking && hints.thinking.recommended));
			setOptions($("reasoningEffort"), ["", ...((hints.reasoningEffort && hints.reasoningEffort.options) || ["low", "medium", "high", "max"])], m.reasoningEffort || "");
			$("doc").textContent = m.documentationUrl ? "Docs: " + m.documentationUrl : "";
		}
		$("provider").addEventListener("change", refreshModels);
		$("model").addEventListener("change", refreshForm);
		$("save").addEventListener("click", () => {
			const m = currentPreset();
			const thinking = $("thinking").value;
			vscode.postMessage({ command: "saveModel", model: {
				...m,
				displayName: $("displayName").value,
				baseUrl: $("baseUrl").value,
				temperature: $("temperature").value === "" ? undefined : Number($("temperature").value),
				topP: $("topP").value === "" ? undefined : Number($("topP").value),
				maxOutputTokens: Number($("maxOutputTokens").value),
				thinking: thinking ? { type: thinking } : undefined,
				reasoningEffort: $("reasoningEffort").value || undefined,
				vision: $("vision").checked,
				toolCalling: $("toolCalling").checked,
				builtIn: undefined
			}});
		});
		$("saveCustom").addEventListener("click", () => {
			vscode.postMessage({ command: "saveCustomModel", model: {
				id: $("customModelId").value.trim(),
				displayName: $("customDisplayName").value.trim() || $("customModelId").value.trim(),
				provider: $("customProvider").value.trim(),
				providerDisplayName: $("customProvider").value.trim(),
				baseUrl: $("customBaseUrl").value.trim(),
				family: "oai-compatible",
				contextLength: Number($("customContext").value) || 128000,
				maxOutputTokens: Number($("customMaxOutput").value) || 4096,
				vision: $("customVision").checked,
				toolCalling: $("customToolCalling").checked,
				headers: {},
				extraBody: {},
				includeReasoningInRequest: false,
				editTools: ["apply-patch", "multi-find-replace", "find-replace"]
			}});
		});
		refreshModels();
		document.getElementById("settings").addEventListener("click", () => vscode.postMessage({ command: "openSettings" }));
		document.getElementById("key").addEventListener("click", () => vscode.postMessage({ command: "setProviderKey" }));
		document.getElementById("export").addEventListener("click", () => vscode.postMessage({ command: "exportModels" }));
		document.getElementById("import").addEventListener("click", () => vscode.postMessage({ command: "importModels" }));
		document.getElementById("output").addEventListener("click", () => vscode.postMessage({ command: "showOutput" }));
	</script>
</body>
</html>`;
}

async function getKeyedProviders(secrets: vscode.SecretStorage, providers: string[]): Promise<string[]> {
	const keyed: string[] = [];
	for (const provider of providers) {
		if (await secrets.get(providerSecretKey(provider))) {
			keyed.push(provider);
		}
	}
	return keyed;
}

function getNonce(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let text = "";
	for (let i = 0; i < 32; i++) {
		text += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return text;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
