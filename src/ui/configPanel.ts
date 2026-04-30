import * as vscode from "vscode";
import { getSettings } from "../config/settings";
import { getRuntimeModelId, listProviders } from "../config/settings";
import { readModelCatalogState } from "../openaiCompat/models";
import { getSelectedPromptPresetId, listPromptPresets } from "../promptPresets";
import { providerSecretKey } from "../secrets";
import type { ModelCatalogState, ModelConfig } from "../types";

export class ConfigPanel {
	static async open(context: vscode.ExtensionContext): Promise<void> {
		const panel = vscode.window.createWebviewPanel(
			"extendedModelsConfig",
			"Copilot Bro Model Settings",
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true
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
			} else if (command === "selectPromptPreset") {
				await vscode.commands.executeCommand("extendedModels.selectPromptPreset");
				panel.webview.html = await renderHtml(panel.webview, context);
			} else if (command === "openPromptPresetFolder") {
				await vscode.commands.executeCommand("extendedModels.openPromptPresetFolder");
			} else if (command === "refreshProviderModels") {
				await vscode.commands.executeCommand("extendedModels.refreshProviderModels");
				panel.webview.html = await renderHtml(panel.webview, context);
			} else if (command === "saveVisionProxy") {
				await saveVisionProxy((message as { visionProxy?: unknown }).visionProxy);
				await panel.webview.postMessage({ command: "savedVisionProxy" });
			} else if (command === "saveModel") {
				await saveModel((message as { model?: unknown }).model);
				await panel.webview.postMessage({ command: "saved" });
			} else if (command === "saveCustomModel") {
				await saveModel((message as { model?: unknown }).model);
				panel.webview.html = await renderHtml(panel.webview, context);
			} else if (command === "setLanguage") {
				const language = (message as { language?: unknown }).language === "en" ? "en" : "zh";
				await vscode.workspace.getConfiguration("extendedModels").update("uiLanguage", language, vscode.ConfigurationTarget.Global);
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

async function saveVisionProxy(value: unknown): Promise<void> {
	if (!value || typeof value !== "object") {
		return;
	}
	const record = value as Record<string, unknown>;
	const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
	await vscode.workspace.getConfiguration("extendedModels").update("visionProxy", {
		enabled: record.enabled === true,
		defaultModelId: typeof record.defaultModelId === "string" ? record.defaultModelId.trim() : "",
		prompt: prompt || undefined
	}, vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage("Saved Copilot Bro vision proxy settings.");
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
	const catalogState = readModelCatalogState(context);
	const settings = getSettings(catalogState);
	const text = UI_TEXT[settings.uiLanguage];
	const providers = listProviders(settings.models);
	const keyedProviders = await getKeyedProviders(context.secrets, providers);
	const hasDefaultKey = Boolean(await context.secrets.get("extendedModels.apiKey"));
	const promptPresets = await listPromptPresets(context);
	const selectedPromptPresetId = getSelectedPromptPresetId(context, settings);
	const selectedPromptPreset = promptPresets.find((preset) => preset.id === selectedPromptPresetId);
	const visionProxyCandidates = await getVisionProxyCandidates(settings.models);
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
		visionProxyModelId: preset.visionProxyModelId,
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
<html lang="${settings.uiLanguage === "zh" ? "zh-CN" : "en"}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(text.title)}</title>
	<style>
		body { font-family: var(--vscode-font-family); padding: 18px; color: var(--vscode-foreground); max-width: 1080px; }
		button, select, input, textarea { margin: 4px 8px 8px 0; }
		button {
			padding: 7px 12px;
			border: 1px solid var(--vscode-button-border, transparent);
			border-radius: 4px;
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
			cursor: pointer;
			font-weight: 600;
		}
		button:hover { background: var(--vscode-button-hoverBackground); }
		button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
		button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
		button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
		label { display: block; margin-top: 8px; font-weight: 600; }
		input, select, textarea { min-width: 260px; padding: 5px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 3px; }
		textarea { width: min(100%, 780px); min-height: 92px; font-family: var(--vscode-editor-font-family); }
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
	<h1>${escapeHtml(text.title)}</h1>
	<div class="card">
		<label for="language" title="${escapeHtml(text.languageTip)}">${escapeHtml(text.language)}</label>
		<select id="language" title="${escapeHtml(text.languageTip)}">
			<option value="zh" title="使用中文显示配置页面" ${settings.uiLanguage === "zh" ? "selected" : ""}>中文</option>
			<option value="en" title="Show this configuration page in English" ${settings.uiLanguage === "en" ? "selected" : ""}>English</option>
		</select>
		<p>${escapeHtml(text.intro)} <strong>${settings.includeBuiltInPresets ? escapeHtml(text.enabled) : escapeHtml(text.disabled)}</strong>.</p>
		<p class="muted">${escapeHtml(text.configuredProviders)} ${providers.length > 0 ? providers.map((provider) => `${keyedProviders.includes(provider) ? "✓ " : ""}${provider}`).join(", ") : escapeHtml(text.none)}${hasDefaultKey ? ` · ${escapeHtml(text.defaultKeySet)}` : ""}</p>
		<button id="settings" title="${escapeHtml(text.settingsTip)}">${escapeHtml(text.settings)}</button>
		<button id="key" title="${escapeHtml(text.keyTip)}">${escapeHtml(text.key)}</button>
		<button id="export" title="${escapeHtml(text.exportTip)}">${escapeHtml(text.export)}</button>
		<button id="import" title="${escapeHtml(text.importTip)}">${escapeHtml(text.import)}</button>
		<button id="refreshModels" title="${escapeHtml(text.refreshModelsTip)}">${escapeHtml(text.refreshModels)}</button>
		<button id="output" title="${escapeHtml(text.outputTip)}">${escapeHtml(text.output)}</button>
		<p class="muted small">${escapeHtml(formatCatalogStatus(text, catalogState.updatedAt, catalogState.errors))}</p>
	</div>
	<div class="card">
		<h2>${escapeHtml(text.visionProxy)}</h2>
		<p class="muted">${escapeHtml(text.visionProxyHelp)}</p>
		<label class="check" title="${escapeHtml(text.visionProxyEnabledTip)}"><input id="visionProxyEnabled" type="checkbox" ${settings.visionProxy.enabled ? "checked" : ""}> ${escapeHtml(text.visionProxyEnabled)}</label>
		<label for="visionProxyDefault" title="${escapeHtml(text.visionProxyDefaultTip)}">${escapeHtml(text.visionProxyDefault)}</label>
		<select id="visionProxyDefault" title="${escapeHtml(text.visionProxyDefaultTip)}"></select>
		<label for="visionProxyPrompt" title="${escapeHtml(text.visionProxyPromptTip)}">${escapeHtml(text.visionProxyPrompt)}</label>
		<textarea id="visionProxyPrompt" title="${escapeHtml(text.visionProxyPromptTip)}">${escapeHtml(settings.visionProxy.prompt)}</textarea>
		<br>
		<button id="saveVisionProxy" title="${escapeHtml(text.saveVisionProxyTip)}">${escapeHtml(text.saveVisionProxy)}</button>
		<div id="visionProxyStatus" class="muted small" aria-live="polite"></div>
	</div>
	<div class="card">
		<h2>${escapeHtml(text.promptPresets)}</h2>
		<p class="muted">${escapeHtml(text.promptPresetsHelp)}</p>
		<p>${escapeHtml(text.currentPromptPreset)} <strong>${escapeHtml(selectedPromptPreset?.label ?? text.none)}</strong></p>
		<p class="muted small">${escapeHtml(text.availablePromptPresets)} ${promptPresets.length}</p>
		<button id="selectPromptPreset" title="${escapeHtml(text.selectPromptPresetTip)}">${escapeHtml(text.selectPromptPreset)}</button>
		<button id="openPromptPresetFolder" class="secondary" title="${escapeHtml(text.openPromptPresetFolderTip)}">${escapeHtml(text.openPromptPresetFolder)}</button>
	</div>
	<div class="card">
		<h2>${escapeHtml(text.editor)}</h2>
		<p class="muted">${escapeHtml(text.editorHelp)}</p>
		<div class="row">
			<div>
				<label for="provider" title="${escapeHtml(text.providerTip)}">${escapeHtml(text.provider)}</label>
				<select id="provider" title="${escapeHtml(text.providerTip)}">${providerNames.map((provider) => `<option value="${escapeHtml(provider)}" title="${escapeHtml(text.providerOptionTip)}">${escapeHtml(`${keyedProviders.includes(provider) ? "✓ " : ""}${provider}`)}</option>`).join("")}</select>
			</div>
			<div>
				<label for="model" title="${escapeHtml(text.modelTip)}">${escapeHtml(text.model)}</label>
				<select id="model" title="${escapeHtml(text.modelTip)}"></select>
			</div>
		</div>
		<div class="grid">
			<div>
				<label for="baseUrl" title="${escapeHtml(text.baseUrlTip)}">${escapeHtml(text.baseUrl)}</label>
				<input id="baseUrl" title="${escapeHtml(text.baseUrlTip)}">
			</div>
			<div>
				<label for="displayName" title="${escapeHtml(text.displayNameTip)}">${escapeHtml(text.displayName)}</label>
				<input id="displayName" title="${escapeHtml(text.displayNameTip)}">
			</div>
			<div>
				<label for="temperature" title="${escapeHtml(text.temperatureTip)}">${escapeHtml(text.temperature)}</label>
				<input id="temperature" type="number" title="${escapeHtml(text.temperatureTip)}">
				<div id="temperatureHint" class="muted small"></div>
			</div>
			<div>
				<label for="topP" title="${escapeHtml(text.topPTip)}">${escapeHtml(text.topP)}</label>
				<input id="topP" type="number" title="${escapeHtml(text.topPTip)}">
				<div id="topPHint" class="muted small"></div>
			</div>
			<div>
				<label for="maxOutputTokens" title="${escapeHtml(text.maxOutputTip)}">${escapeHtml(text.maxOutput)}</label>
				<input id="maxOutputTokens" type="number" title="${escapeHtml(text.maxOutputTip)}">
				<div id="maxOutputTokensHint" class="muted small"></div>
			</div>
			<div>
				<label for="thinking" title="${escapeHtml(text.thinkingTip)}">${escapeHtml(text.thinking)}</label>
				<select id="thinking" title="${escapeHtml(text.thinkingTip)}"></select>
			</div>
			<div>
				<label for="reasoningEffort" title="${escapeHtml(text.reasoningTip)}">${escapeHtml(text.reasoning)}</label>
				<select id="reasoningEffort" title="${escapeHtml(text.reasoningTip)}"></select>
			</div>
			<div>
				<label class="check" title="${escapeHtml(text.visionTip)}"><input id="vision" type="checkbox" title="${escapeHtml(text.visionTip)}"> ${escapeHtml(text.vision)}</label>
				<label class="check" title="${escapeHtml(text.toolCallingTip)}"><input id="toolCalling" type="checkbox" title="${escapeHtml(text.toolCallingTip)}"> ${escapeHtml(text.toolCalling)}</label>
			</div>
			<div>
				<label for="visionProxyModelId" title="${escapeHtml(text.modelVisionProxyTip)}">${escapeHtml(text.modelVisionProxy)}</label>
				<select id="visionProxyModelId" title="${escapeHtml(text.modelVisionProxyTip)}"></select>
			</div>
		</div>
		<button id="save" title="${escapeHtml(text.saveTip)}">${escapeHtml(text.save)}</button>
		<div id="saveStatus" class="muted small" aria-live="polite"></div>
		<div id="doc" class="muted small"></div>
	</div>
	<div class="card">
		<h2>${escapeHtml(text.presets)}</h2>
		<p class="muted">${presets.length} ${escapeHtml(text.presetsHelp)}</p>
	</div>
	<div class="card">
		<h2>${escapeHtml(text.custom)}</h2>
		<div class="grid">
			<div><label for="customProvider" title="${escapeHtml(text.customProviderTip)}">${escapeHtml(text.customProvider)}</label><input id="customProvider" title="${escapeHtml(text.customProviderTip)}" placeholder="my-provider"></div>
			<div><label for="customModelId" title="${escapeHtml(text.customModelTip)}">${escapeHtml(text.customModel)}</label><input id="customModelId" title="${escapeHtml(text.customModelTip)}" placeholder="my-model"></div>
			<div><label for="customDisplayName" title="${escapeHtml(text.displayNameTip)}">${escapeHtml(text.displayName)}</label><input id="customDisplayName" title="${escapeHtml(text.displayNameTip)}" placeholder="My Model"></div>
			<div><label for="customBaseUrl" title="${escapeHtml(text.baseUrlTip)}">${escapeHtml(text.baseUrl)}</label><input id="customBaseUrl" title="${escapeHtml(text.baseUrlTip)}" placeholder="https://example.com/v1"></div>
			<div><label for="customContext" title="${escapeHtml(text.contextTip)}">${escapeHtml(text.context)}</label><input id="customContext" title="${escapeHtml(text.contextTip)}" type="number" value="128000"></div>
			<div><label for="customMaxOutput" title="${escapeHtml(text.maxOutputTip)}">${escapeHtml(text.maxOutput)}</label><input id="customMaxOutput" title="${escapeHtml(text.maxOutputTip)}" type="number" value="4096"></div>
			<div><label for="customTemperature" title="${escapeHtml(text.temperatureTip)}">${escapeHtml(text.temperature)}</label><input id="customTemperature" title="${escapeHtml(text.temperatureTip)}" type="number" step="0.1" value="1"></div>
			<div><label for="customTopP" title="${escapeHtml(text.topPTip)}">${escapeHtml(text.topP)}</label><input id="customTopP" title="${escapeHtml(text.topPTip)}" type="number" step="0.05" value="1"></div>
			<div><label for="customThinking" title="${escapeHtml(text.thinkingTip)}">${escapeHtml(text.thinking)}</label><select id="customThinking" title="${escapeHtml(text.thinkingTip)}"><option value="disabled">disabled</option><option value="enabled" selected>enabled</option></select></div>
			<div><label for="customReasoningEffort" title="${escapeHtml(text.reasoningTip)}">${escapeHtml(text.reasoning)}</label><select id="customReasoningEffort" title="${escapeHtml(text.reasoningTip)}"><option value=""></option><option value="low">low</option><option value="medium">medium</option><option value="high" selected>high</option><option value="max">max</option></select></div>
			<div><label for="customVisionProxyModelId" title="${escapeHtml(text.modelVisionProxyTip)}">${escapeHtml(text.modelVisionProxy)}</label><select id="customVisionProxyModelId" title="${escapeHtml(text.modelVisionProxyTip)}"></select></div>
			<div><label class="check" title="${escapeHtml(text.visionTip)}"><input id="customVision" type="checkbox" title="${escapeHtml(text.visionTip)}"> ${escapeHtml(text.vision)}</label><label class="check" title="${escapeHtml(text.toolCallingTip)}"><input id="customToolCalling" type="checkbox" checked title="${escapeHtml(text.toolCallingTip)}"> ${escapeHtml(text.toolCalling)}</label></div>
		</div>
		<button id="saveCustom" title="${escapeHtml(text.saveCustomTip)}">${escapeHtml(text.saveCustom)}</button>
		<p class="muted small">${escapeHtml(text.customHelp)}</p>
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
		const visionProxyCandidates = ${JSON.stringify(visionProxyCandidates)};
		const configuredVisionProxyDefault = ${JSON.stringify(settings.visionProxy.defaultModelId)};
		const byProvider = presets.reduce((a, p) => ((a[p.provider] ||= []).push(p), a), {});
		const $ = id => document.getElementById(id);
		const restoredState = vscode.getState() || {};
		function persistState(extra = {}) {
			vscode.setState({
				provider: $("provider")?.value,
				model: $("model")?.value,
				scrollY: window.scrollY,
				...extra
			});
		}
		function post(command, payload = {}) {
			persistState();
			vscode.postMessage({ command, ...payload });
		}
		function setOptions(select, values, selected) {
			select.innerHTML = values.map(v => '<option value="' + String(v).replaceAll('"', '&quot;') + '">' + v + '</option>').join('');
			if (selected) select.value = selected;
		}
		function escapeAttr(value) { return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'); }
		function renderVisionProxyOptions(select, selected, options = {}) {
			const selfId = options.selfId || "";
			const allowDisable = options.allowDisable !== false;
			const rows = [{ id: "", label: options.autoLabel || "${escapeJs(text.visionProxyAuto)}" }];
			if (allowDisable) rows.push({ id: "null", label: "${escapeJs(text.visionProxyDisabled)}" });
			for (const candidate of visionProxyCandidates) {
				if (candidate.id !== selfId) rows.push(candidate);
			}
			if (selected && selected !== "null" && !rows.some(row => row.id === selected)) {
				rows.push({ id: selected, label: selected + " (${escapeJs(text.visionProxyUnknown)})" });
			}
			select.innerHTML = rows.map(row => '<option value="' + escapeAttr(row.id) + '" title="' + escapeAttr(row.detail || row.id) + '">' + escapeAttr(row.label) + '</option>').join('');
			select.value = selected || "";
		}
		function visionProxyToFormValue(value) { return value === null ? "null" : (value || ""); }
		function formValueToVisionProxy(value) { return value === "null" ? null : (value || undefined); }
		function hintText(h) { return h ? 'range ' + h.min + '-' + h.max + ', recommended ' + h.recommended : ''; }
		function selectedProvider() { return $("provider").value.replace(/^✓\\s*/, ""); }
		function currentPreset() { return (byProvider[selectedProvider()] || [])[Number($("model").value) || 0]; }
		function refreshModels() {
			const models = byProvider[selectedProvider()] || [];
			$("model").innerHTML = models.map((m, i) => '<option title="${escapeJs(text.modelOptionTip)}" value="' + i + '">' + (m.displayName || m.id) + (m.category ? ' · ' + m.category : '') + '</option>').join('');
			if (restoredState.model && Array.from($("model").options).some(o => o.value === restoredState.model)) $("model").value = restoredState.model;
			refreshForm();
		}
		$("language").addEventListener("change", () => post("setLanguage", { language: $("language").value }));
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
			renderVisionProxyOptions($("visionProxyModelId"), visionProxyToFormValue(m.visionProxyModelId), { selfId: m.id, autoLabel: "${escapeJs(text.modelVisionProxyAuto)}" });
			const hints = m.parameterHints || {};
			for (const [id, key] of [["temperatureHint","temperature"],["topPHint","topP"],["maxOutputTokensHint","maxOutputTokens"]]) $(id).textContent = hintText(hints[key]);
			setOptions($("thinking"), (hints.thinking && hints.thinking.options) || ["disabled", "enabled"], (m.thinking && m.thinking.type) || (hints.thinking && hints.thinking.recommended));
			setOptions($("reasoningEffort"), ["", ...((hints.reasoningEffort && hints.reasoningEffort.options) || ["low", "medium", "high", "max"])], m.reasoningEffort || "");
			$("doc").textContent = m.documentationUrl ? "Docs: " + m.documentationUrl : "";
			$("saveStatus").textContent = "";
			persistState();
		}
		$("provider").addEventListener("change", () => { persistState({ model: "0" }); refreshModels(); });
		$("model").addEventListener("change", refreshForm);
		$("save").addEventListener("click", () => {
			const m = currentPreset();
			const thinking = $("thinking").value;
			post("saveModel", { model: {
				...m,
				displayName: $("displayName").value,
				baseUrl: $("baseUrl").value,
				temperature: $("temperature").value === "" ? undefined : Number($("temperature").value),
				topP: $("topP").value === "" ? undefined : Number($("topP").value),
				maxOutputTokens: Number($("maxOutputTokens").value),
				thinking: thinking ? { type: thinking } : undefined,
				reasoningEffort: $("reasoningEffort").value || undefined,
				vision: $("vision").checked,
				visionProxyModelId: formValueToVisionProxy($("visionProxyModelId").value),
				toolCalling: $("toolCalling").checked,
				builtIn: undefined
			}});
		});
		$("saveCustom").addEventListener("click", () => {
			post("saveCustomModel", { model: {
				id: $("customModelId").value.trim(),
				displayName: $("customDisplayName").value.trim() || $("customModelId").value.trim(),
				provider: $("customProvider").value.trim(),
				providerDisplayName: $("customProvider").value.trim(),
				baseUrl: $("customBaseUrl").value.trim(),
				family: "oai-compatible",
				contextLength: Number($("customContext").value) || 128000,
				maxOutputTokens: Number($("customMaxOutput").value) || 4096,
				temperature: $("customTemperature").value === "" ? undefined : Number($("customTemperature").value),
				topP: $("customTopP").value === "" ? undefined : Number($("customTopP").value),
				thinking: $("customThinking").value ? { type: $("customThinking").value } : undefined,
				reasoningEffort: $("customReasoningEffort").value || undefined,
				vision: $("customVision").checked,
				visionProxyModelId: formValueToVisionProxy($("customVisionProxyModelId").value),
				toolCalling: $("customToolCalling").checked,
				headers: {},
				extraBody: {},
				includeReasoningInRequest: false,
				editTools: ["apply-patch", "multi-find-replace", "find-replace"],
				parameterHints: {
					temperature: { min: 0, max: 2, step: 0.1, recommended: Number($("customTemperature").value) || 1 },
					topP: { min: 0, max: 1, step: 0.05, recommended: Number($("customTopP").value) || 1 },
					maxOutputTokens: { min: 1, max: Number($("customContext").value) || 128000, step: 1024, recommended: Number($("customMaxOutput").value) || 4096 },
					thinking: { options: ["enabled", "disabled"], recommended: $("customThinking").value || "disabled" },
					reasoningEffort: { options: ["low", "medium", "high", "max"], recommended: $("customReasoningEffort").value || "high" }
				}
			}});
		});
		if (restoredState.provider && byProvider[restoredState.provider]) $("provider").value = restoredState.provider;
		renderVisionProxyOptions($("visionProxyDefault"), configuredVisionProxyDefault, { allowDisable: false });
		renderVisionProxyOptions($("customVisionProxyModelId"), "", { autoLabel: "${escapeJs(text.modelVisionProxyAuto)}" });
		refreshModels();
		if (typeof restoredState.scrollY === "number") setTimeout(() => window.scrollTo(0, restoredState.scrollY), 0);
		window.addEventListener("scroll", () => persistState(), { passive: true });
		window.addEventListener("message", event => {
			if (event.data && event.data.command === "saved") {
				$("saveStatus").textContent = "${escapeJs(text.saved)}";
				persistState();
			} else if (event.data && event.data.command === "savedVisionProxy") {
				$("visionProxyStatus").textContent = "${escapeJs(text.savedVisionProxy)}";
				persistState();
			}
		});
		document.getElementById("settings").addEventListener("click", () => post("openSettings"));
		document.getElementById("key").addEventListener("click", () => post("setProviderKey"));
		document.getElementById("export").addEventListener("click", () => post("exportModels"));
		document.getElementById("import").addEventListener("click", () => post("importModels"));
		document.getElementById("refreshModels").addEventListener("click", () => post("refreshProviderModels"));
		document.getElementById("output").addEventListener("click", () => post("showOutput"));
		document.getElementById("selectPromptPreset").addEventListener("click", () => post("selectPromptPreset"));
		document.getElementById("openPromptPresetFolder").addEventListener("click", () => post("openPromptPresetFolder"));
		document.getElementById("saveVisionProxy").addEventListener("click", () => post("saveVisionProxy", { visionProxy: {
			enabled: $("visionProxyEnabled").checked,
			defaultModelId: $("visionProxyDefault").value,
			prompt: $("visionProxyPrompt").value
		}}));
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

async function getVisionProxyCandidates(models: readonly ModelConfig[]): Promise<Array<{ id: string; label: string; detail: string }>> {
	const out = new Map<string, { id: string; label: string; detail: string }>();
	for (const model of models) {
		if (model.vision) {
			const id = getRuntimeModelId(model);
			out.set(id, {
				id,
				label: `${model.displayName ?? model.id} (${model.providerDisplayName ?? model.provider})`,
				detail: id
			});
		}
	}
	try {
		const lmModels = await vscode.lm.selectChatModels();
		for (const model of lmModels) {
			const capabilities = (model as unknown as { capabilities?: { imageInput?: boolean } }).capabilities;
			if (model.vendor !== "extendedModels") {
				out.set(model.id, {
					id: model.id,
					label: `${model.name} (${model.vendor}${capabilities?.imageInput ? " · vision" : ""})`,
					detail: model.id
				});
			}
		}
	} catch {
		// The configuration page still shows extension vision models if Copilot models are unavailable.
	}
	return Array.from(out.values()).sort((a, b) => a.label.localeCompare(b.label));
}

const UI_TEXT = {
	zh: {
		title: "Copilot Bro",
		language: "界面语言",
		languageTip: "选择配置页面使用中文或英文显示。该选择会保存到 VS Code 设置。",
		intro: "从 Copilot Chat 模型选择器使用扩展模型。内置预设当前为",
		enabled: "启用",
		disabled: "禁用",
		configuredProviders: "已配置供应商：",
		defaultKeySet: "已设置默认 API Key",
		none: "无",
		settings: "打开 Settings JSON",
		settingsTip: "打开 VS Code settings.json，查看或手动编辑 extendedModels 配置。",
		key: "设置供应商 API Key",
		keyTip: "把 API Key 保存到本机 SecretStorage。不会写入 settings.json 或导出文件。",
		export: "导出模型配置",
		exportTip: "导出模型配置。敏感字段和 API Key 会被过滤。",
		import: "导入模型配置",
		importTip: "从 JSON 文件导入模型配置。导入文件不应包含 API Key。",
		refreshModels: "刷新供应商模型列表",
		refreshModelsTip: "使用本机 SecretStorage 中的 API Key 调用供应商 /models 接口，刷新可用模型列表。失败时保留内置预设或上次缓存。",
		catalogNeverRefreshed: "供应商模型列表尚未从远端刷新，将使用内置预设。",
		catalogLastRefreshed: "远端模型列表上次刷新时间：",
		catalogErrors: "刷新错误：",
		output: "显示诊断输出",
		outputTip: "打开 Copilot Bro 输出通道，查看已脱敏的诊断日志。",
		visionProxy: "识图代理 / Vision Proxy",
		visionProxyHelp: "无原生视觉能力的模型可先调用另一个支持图片输入的模型生成图片描述，然后由当前模型继续回答。默认会自动选择可用的内置 Copilot 视觉模型。",
		visionProxyEnabled: "启用全局识图代理",
		visionProxyEnabledTip: "仅对没有单独配置且没有原生视觉能力的模型生效。",
		visionProxyDefault: "默认视觉模型 ID",
		visionProxyDefaultTip: "填写任意已安装且支持 imageInput 的模型 ID，留空则自动选择内置 Copilot 视觉模型。",
		visionProxyAuto: "自动选择可用视觉模型",
		visionProxyDisabled: "禁用识图代理",
		visionProxyUnknown: "当前配置，未在候选列表中",
		visionProxyPrompt: "图片描述 Prompt",
		visionProxyPromptTip: "发送给视觉代理模型的提示词，用于把图片转成当前模型可读的文本描述。",
		saveVisionProxy: "保存识图代理设置",
		saveVisionProxyTip: "保存全局识图代理设置。模型级配置会优先于这里的默认值。",
		savedVisionProxy: "已保存识图代理设置。",
		promptPresets: "预设提示词",
		promptPresetsHelp: "选择一个 *.copilot-bro.prompt.md 预设后，每次使用扩展模型请求都会把它作为系统上下文注入。",
		currentPromptPreset: "当前预设：",
		availablePromptPresets: "可用预设数量：",
		selectPromptPreset: "选择预设提示词",
		selectPromptPresetTip: "从内置、全局和工作区预设中选择一个当前要使用的提示词。",
		openPromptPresetFolder: "打开全局预设文件夹",
		openPromptPresetFolderTip: "打开全局 *.copilot-bro.prompt.md 文件夹，可添加自己的 Markdown 预设。",
		editor: "供应商模型编辑器",
		editorHelp: "选择官方预设，调整常用参数，然后保存为本地覆盖配置。API Key 不会保存在这里。",
		provider: "供应商",
		providerTip: "选择模型所属供应商。带 ✓ 表示该供应商已在本机保存 API Key。",
		providerOptionTip: "选择该供应商后，模型列表会显示它的官方预设和本地覆盖配置。",
		model: "模型",
		modelTip: "选择要编辑的模型。保存后会保留当前选择并应用到扩展配置。",
		modelOptionTip: "选择此模型以查看和修改它的常用参数。",
		baseUrl: "Base URL",
		baseUrlTip: "OpenAI-compatible API 基础地址，不包含 /chat/completions。",
		displayName: "显示名称",
		displayNameTip: "模型在 VS Code / Copilot 模型选择器中的名称。",
		temperature: "Temperature",
		temperatureTip: "采样温度。较低更稳定，较高更发散。默认偏向充分思考模型的推荐值。",
		topP: "Top P",
		topPTip: "核采样范围。通常保持供应商推荐值即可。",
		maxOutput: "最大输出 Tokens",
		maxOutputTip: "模型单次回答允许生成的最大 token 数。越大越适合长任务，但成本也可能更高。",
		thinking: "Thinking",
		thinkingTip: "控制模型是否启用思考模式。默认尽量启用，除非模型不支持。",
		reasoning: "Reasoning Effort",
		reasoningTip: "推理强度。high/max 更适合复杂编码、重构和 Agent 任务。",
		vision: "视觉输入",
		visionTip: "声明模型是否支持图片输入。仅在供应商模型实际支持时开启。",
		modelVisionProxy: "模型级视觉代理",
		modelVisionProxyTip: "为当前模型指定另一个视觉模型 ID。留空表示使用全局默认；填 null 表示禁用该模型的代理；不能填当前模型自己。",
		modelVisionProxyAuto: "使用全局默认 / 自动选择",
		toolCalling: "工具调用 / Agent",
		toolCallingTip: "声明模型是否支持 function calling。Agent 模式通常需要开启。",
		save: "保存本地模型覆盖",
		saveTip: "保存当前模型参数到 settings.json，并保留当前页面选择。API Key 不会保存。",
		saved: "已保存当前模型参数，当前页面状态已保留。",
		presets: "官方预设",
		presetsHelp: "个预设，覆盖 DeepSeek、智谱、MiniMax、Kimi 和 Qwen。",
		custom: "添加自定义供应商 / 模型",
		customProvider: "供应商 Key",
		customProviderTip: "自定义供应商标识，用于分组 API Key，例如 my-provider。",
		customModel: "模型 ID",
		customModelTip: "供应商 API 使用的真实模型名，例如 my-model。",
		context: "上下文长度",
		contextTip: "模型支持的最大上下文 token 数。",
		saveCustom: "添加自定义模型",
		saveCustomTip: "保存自定义供应商和模型配置。API Key 仍需通过 Set Provider API Key 单独保存。",
		customHelp: "保存后，请使用“设置供应商 API Key”为该 provider 保存本地密钥。密钥只保存在 SecretStorage。"
	},
	en: {
		title: "Copilot Bro",
		language: "UI Language",
		languageTip: "Choose Chinese or English for this configuration page. The choice is saved to VS Code settings.",
		intro: "Use extension-provided models from the Copilot Chat model picker. Built-in presets are currently",
		enabled: "enabled",
		disabled: "disabled",
		configuredProviders: "Configured providers:",
		defaultKeySet: "default API key set",
		none: "none",
		settings: "Open Settings JSON",
		settingsTip: "Open VS Code settings.json to inspect or manually edit extendedModels settings.",
		key: "Set Provider API Key",
		keyTip: "Store an API key in local SecretStorage. It is never written to settings.json or exports.",
		export: "Export Models",
		exportTip: "Export model settings. Sensitive fields and API keys are filtered.",
		import: "Import Models",
		importTip: "Import model settings from JSON. Imported files should not contain API keys.",
		refreshModels: "Refresh Provider Models",
		refreshModelsTip: "Call provider /models endpoints with API keys from local SecretStorage. Built-in presets or cached results remain available if refresh fails.",
		catalogNeverRefreshed: "Provider models have not been refreshed remotely yet; built-in presets are used.",
		catalogLastRefreshed: "Remote model list last refreshed:",
		catalogErrors: "Refresh errors:",
		output: "Show Diagnostics Output",
		outputTip: "Open the Copilot Bro output channel with redacted diagnostic logs.",
		visionProxy: "Vision Proxy",
		visionProxyHelp: "Text-only models can ask another image-capable model to describe images first, then continue with the current model. Empty default auto-picks an installed Copilot vision model.",
		visionProxyEnabled: "Enable global vision proxy",
		visionProxyEnabledTip: "Applies only to models without native vision and without a model-level override.",
		visionProxyDefault: "Default vision model ID",
		visionProxyDefaultTip: "Use any installed image-capable model ID. Leave empty to auto-pick a built-in Copilot vision model.",
		visionProxyAuto: "Auto-pick an available vision model",
		visionProxyDisabled: "Disable vision proxy",
		visionProxyUnknown: "current setting, not in candidates",
		visionProxyPrompt: "Image description prompt",
		visionProxyPromptTip: "Prompt sent to the vision proxy model to turn images into text for the current model.",
		saveVisionProxy: "Save Vision Proxy Settings",
		saveVisionProxyTip: "Save global vision proxy settings. Model-level settings take precedence.",
		savedVisionProxy: "Vision proxy settings saved.",
		promptPresets: "Prompt Presets",
		promptPresetsHelp: "Select a *.copilot-bro.prompt.md preset and Copilot Bro prepends it as system context for extension-model requests.",
		currentPromptPreset: "Current preset:",
		availablePromptPresets: "Available presets:",
		selectPromptPreset: "Select Prompt Preset",
		selectPromptPresetTip: "Choose a preset from built-in, global, or workspace Markdown files.",
		openPromptPresetFolder: "Open Global Preset Folder",
		openPromptPresetFolderTip: "Open the global folder for your own *.copilot-bro.prompt.md files.",
		editor: "Provider Model Editor",
		editorHelp: "Select an official preset, tune common parameters, then save a local override. API keys are never stored here.",
		provider: "Provider",
		providerTip: "Select the provider. A ✓ means a local API key exists for this provider.",
		providerOptionTip: "Select this provider to view official presets and local overrides.",
		model: "Model",
		modelTip: "Select the model to edit. Saving keeps the current selection and applies the extension setting immediately.",
		modelOptionTip: "Select this model to view and edit common parameters.",
		baseUrl: "Base URL",
		baseUrlTip: "OpenAI-compatible base URL without /chat/completions.",
		displayName: "Display Name",
		displayNameTip: "Name shown in the VS Code / Copilot model picker.",
		temperature: "Temperature",
		temperatureTip: "Sampling temperature. Lower is more stable, higher is more diverse. Defaults favor reasoning where supported.",
		topP: "Top P",
		topPTip: "Nucleus sampling value. Usually keep the provider recommendation.",
		maxOutput: "Max Output Tokens",
		maxOutputTip: "Maximum tokens the model may generate in one response. Larger values help long tasks but may cost more.",
		thinking: "Thinking",
		thinkingTip: "Controls whether model thinking mode is enabled. Defaults enable it where supported.",
		reasoning: "Reasoning Effort",
		reasoningTip: "Reasoning depth. high/max is better for complex coding, refactoring, and Agent tasks.",
		vision: "Vision Input",
		visionTip: "Declare whether this model supports image input. Enable only when the provider model supports it.",
		modelVisionProxy: "Model Vision Proxy",
		modelVisionProxyTip: "Set another vision model ID for this model. Empty uses the global default; null disables proxying for this model; do not set the current model itself.",
		modelVisionProxyAuto: "Use global default / auto-pick",
		toolCalling: "Tool Calling / Agent",
		toolCallingTip: "Declare whether this model supports function calling. Agent mode usually requires it.",
		save: "Save Local Model Override",
		saveTip: "Save current model parameters to settings.json while keeping the current page selection. API keys are not saved.",
		saved: "Current model parameters saved; page state was preserved.",
		presets: "Official Presets",
		presetsHelp: "presets across DeepSeek, Zhipu, MiniMax, Kimi, and Qwen.",
		custom: "Add Custom Provider / Model",
		customProvider: "Provider Key",
		customProviderTip: "Custom provider identifier used for API key grouping, for example my-provider.",
		customModel: "Model ID",
		customModelTip: "Actual model name used by the provider API, for example my-model.",
		context: "Context Length",
		contextTip: "Maximum context window supported by the model.",
		saveCustom: "Add Custom Model",
		saveCustomTip: "Save a custom provider/model. API key still needs Set Provider API Key.",
		customHelp: "After saving, use Set Provider API Key for this provider. Keys stay in local SecretStorage only."
	}
};

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

function escapeJs(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function formatCatalogStatus(
	text: typeof UI_TEXT.zh | typeof UI_TEXT.en,
	updatedAt: ModelCatalogState["updatedAt"],
	errors: ModelCatalogState["errors"]
): string {
	const parts = [
		updatedAt > 0
			? `${text.catalogLastRefreshed} ${new Date(updatedAt).toLocaleString()}`
			: text.catalogNeverRefreshed
	];
	const errorEntries = Object.entries(errors ?? {});
	if (errorEntries.length > 0) {
		parts.push(`${text.catalogErrors} ${errorEntries.map(([provider, message]) => `${provider}: ${message}`).join("; ")}`);
	}
	return parts.join(" ");
}
