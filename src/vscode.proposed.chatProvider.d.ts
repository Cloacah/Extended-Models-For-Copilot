declare module "vscode" {
	export interface ProvideLanguageModelChatResponseOptions {
		readonly requestInitiator?: string;
		readonly tools?: readonly {
			readonly name: string;
			readonly description?: string;
			readonly inputSchema?: unknown;
		}[];
		readonly toolMode?: unknown;
		readonly modelOptions?: Record<string, unknown>;
	}

	export interface LanguageModelChatCapabilities {
		readonly imageInput?: boolean;
		readonly toolCalling?: boolean | number;
		readonly editTools?: readonly string[];
	}

	export interface LanguageModelChatInformation {
		readonly id: string;
		readonly name: string;
		readonly family: string;
		readonly version: string;
		readonly maxInputTokens: number;
		readonly maxOutputTokens: number;
		readonly tooltip?: string;
		readonly detail?: string;
		readonly capabilities: LanguageModelChatCapabilities;
		readonly isUserSelectable?: boolean;
		readonly category?: { readonly label: string; readonly order: number };
	}

	export interface LanguageModelChatProvider<T extends LanguageModelChatInformation = LanguageModelChatInformation> {
		provideLanguageModelChatInformation(
			options: { readonly silent: boolean },
			token: CancellationToken
		): ProviderResult<T[]>;

		provideLanguageModelChatResponse(
			model: T,
			messages: readonly LanguageModelChatRequestMessage[],
			options: ProvideLanguageModelChatResponseOptions,
			progress: Progress<LanguageModelResponsePart | LanguageModelDataPart | LanguageModelThinkingPart>,
			token: CancellationToken
		): Thenable<void>;

		provideTokenCount(
			model: T,
			text: string | LanguageModelChatRequestMessage,
			token: CancellationToken
		): ProviderResult<number>;
	}

	export namespace lm {
		export function registerLanguageModelChatProvider(
			vendor: string,
			provider: LanguageModelChatProvider
		): Disposable;
	}

	export class LanguageModelThinkingPart {
		constructor(value: string | readonly string[], id?: string);
		readonly value: string | readonly string[];
		readonly id?: string;
	}
}
