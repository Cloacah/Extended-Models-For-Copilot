import type { ChatCompletionRequestBody, ModelConfig, RetrySettings, StreamEvent } from "../types";
import { createHttpError, isRetryableError, normalizeUnknownError, ProviderError } from "../errors";
import { OpenAIStreamParser } from "./sse";

const DEFAULT_RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

export interface SendChatCompletionOptions {
	apiKey: string;
	model: ModelConfig;
	body: ChatCompletionRequestBody;
	headers: Record<string, string>;
	retry: RetrySettings;
	timeoutMs: number;
	cancellation?: {
		readonly isCancellationRequested?: boolean;
		onCancellationRequested?: (listener: () => void) => { dispose(): void };
	};
	onEvent: (event: StreamEvent) => void | Promise<void>;
	onRetry?: (attempt: number, delayMs: number, error: ProviderError) => void;
}

export async function sendChatCompletion(options: SendChatCompletionOptions): Promise<void> {
	const url = `${options.model.baseUrl?.replace(/\/+$/, "")}/chat/completions`;
	await executeWithRetry(async () => {
		const controller = new AbortController();
		let timedOutPhase: "connect" | "idle" | undefined;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let rejectTimeout: ((error: Error) => void) | undefined;
		const timeoutPromise = new Promise<never>((_resolve, reject) => {
			rejectTimeout = reject;
		});
		const resetTimeout = (phase: "connect" | "idle") => {
			if (timeout) {
				clearTimeout(timeout);
			}
			timedOutPhase = undefined;
			timeout = setTimeout(() => {
				timedOutPhase = phase;
				controller.abort();
				rejectTimeout?.(new Error("timeout"));
			}, options.timeoutMs);
		};
		const abortForCancellation = () => {
			timedOutPhase = undefined;
			controller.abort();
		};
		resetTimeout("connect");
		const cancellationDisposable = options.cancellation?.onCancellationRequested?.(() => {
			abortForCancellation();
		});

		try {
			if (options.cancellation?.isCancellationRequested) {
				throw new ProviderError("The model request was cancelled.", { code: "CANCELLED", retryable: false });
			}

			const response = await Promise.race([
				fetch(url, {
					method: "POST",
					headers: options.headers,
					body: JSON.stringify(options.body),
					signal: controller.signal
				}),
				timeoutPromise
			]);

			if (!response.ok) {
				const text = await safeReadText(response);
				throw createHttpError(response.status, response.statusText, text, url);
			}
			if (!response.body) {
				throw new ProviderError("Provider returned an empty response body.", { code: "EMPTY_BODY", retryable: true, url });
			}

			resetTimeout("idle");
			const parser = new OpenAIStreamParser();
			await Promise.race([
				parser.parse(response.body, options.onEvent, options.cancellation, () => resetTimeout("idle")),
				timeoutPromise
			]);
		} catch (error) {
			if (timedOutPhase) {
				const label = timedOutPhase === "connect" ? "before the provider responded" : "without provider stream activity";
				throw new ProviderError(`Provider request timed out after ${options.timeoutMs}ms ${label}.`, {
					code: "TIMEOUT",
					url,
					retryable: true
				});
			}
			if (options.cancellation?.isCancellationRequested) {
				throw new ProviderError("The model request was cancelled.", {
					code: "CANCELLED",
					url,
					retryable: false
				});
			}
			throw normalizeUnknownError(error);
		} finally {
			if (timeout) {
				clearTimeout(timeout);
			}
			cancellationDisposable?.dispose();
		}
	}, options.retry, options.onRetry);
}

export async function executeWithRetry<T>(
	fn: () => Promise<T>,
	retry: RetrySettings,
	onRetry?: (attempt: number, delayMs: number, error: ProviderError) => void
): Promise<T> {
	if (!retry.enabled) {
		return await fn();
	}

	const retryableStatuses = new Set([...DEFAULT_RETRYABLE_STATUS_CODES, ...retry.statusCodes]);
	let lastError: unknown;

	for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isRetryableError(error, Array.from(retryableStatuses)) || attempt >= retry.maxAttempts) {
				throw error;
			}
			const delay = Math.min(retry.baseDelayMs * 2 ** (attempt - 1), 60000);
			onRetry?.(attempt, delay, normalizeUnknownError(error));
			await sleep(delay);
		}
	}

	throw normalizeUnknownError(lastError);
}

async function safeReadText(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return "";
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
