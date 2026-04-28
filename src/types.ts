export type LogLevel = "off" | "error" | "warn" | "info" | "debug";

export interface RetrySettings {
	enabled: boolean;
	maxAttempts: number;
	baseDelayMs: number;
	statusCodes: number[];
}

export interface ThinkingSettings {
	type?: "enabled" | "disabled";
}

export interface NumberParameterHint {
	min: number;
	max: number;
	step: number;
	recommended: number;
}

export interface SelectParameterHint {
	options: string[];
	recommended: string;
}

export interface ModelParameterHints {
	temperature?: NumberParameterHint;
	topP?: NumberParameterHint;
	maxOutputTokens?: NumberParameterHint;
	reasoningEffort?: SelectParameterHint;
	thinking?: SelectParameterHint;
}

export interface ModelConfig {
	id: string;
	displayName?: string;
	configId?: string;
	provider: string;
	providerDisplayName?: string;
	category?: string;
	baseUrl?: string;
	family?: string;
	contextLength: number;
	maxOutputTokens: number;
	maxCompletionTokens?: number;
	vision: boolean;
	toolCalling: boolean;
	temperature?: number | null;
	topP?: number | null;
	reasoningEffort?: string;
	thinking?: ThinkingSettings;
	headers: Record<string, string>;
	extraBody: Record<string, unknown>;
	includeReasoningInRequest: boolean;
	editTools: string[];
	parameterHints?: ModelParameterHints;
	documentationUrl?: string;
	builtIn?: boolean;
}

export interface ExtensionSettings {
	includeBuiltInPresets: boolean;
	defaultBaseUrl: string;
	models: ModelConfig[];
	retry: RetrySettings;
	requestTimeoutMs: number;
	logLevel: LogLevel;
}

export interface ProviderErrorDetails {
	status?: number;
	code?: string;
	body?: string;
	url?: string;
	retryable?: boolean;
}

export interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content?: string | OpenAIContentPart[] | null;
	name?: string;
	tool_call_id?: string;
	tool_calls?: OpenAIToolCall[];
	reasoning_content?: string;
}

export type OpenAIContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

export interface OpenAIToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface OpenAIToolDefinition {
	type: "function";
	function: {
		name: string;
		description?: string;
		parameters: unknown;
	};
}

export interface ChatCompletionRequestBody {
	model: string;
	messages: OpenAIMessage[];
	stream: true;
	stream_options?: { include_usage: boolean };
	tools?: OpenAIToolDefinition[];
	tool_choice?: "auto" | { type: "function"; function: { name: string } };
	temperature?: number;
	top_p?: number;
	max_tokens?: number;
	max_completion_tokens?: number;
	reasoning_effort?: string;
	thinking?: ThinkingSettings;
	[key: string]: unknown;
}

export type StreamEvent =
	| { type: "text"; text: string }
	| { type: "thinking"; text: string; id?: string }
	| { type: "tool_call"; id: string; name: string; input: Record<string, unknown> };
