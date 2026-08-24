/**
 * Legacy surface required by @mariozechner/pi-web-ui 0.73.x, reimplemented on
 * top of the current @earendil-works/pi-ai API. The bundler redirects web-ui's
 * `@mariozechner/pi-ai` imports here so both layers share one live catalog.
 */
import {
	type Api,
	type AssistantMessage,
	type Context,
	createModels,
	type Model,
	type SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import { Type } from "typebox";

const registry = createModels();

export function getModel(provider: string, id: string): Model<Api> | undefined {
	return registry.getModel(provider, id);
}

export function getModels(provider?: string): readonly Model<Api>[] {
	return registry.getModels(provider);
}

export function getProviders(): string[] {
	return registry.getProviders().map((provider) => provider.id);
}

export function streamSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions) {
	return registry.streamSimple(model, context, options);
}

export async function complete(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	return registry.streamSimple(model, context, options).result();
}

export function StringEnum<T extends readonly string[]>(values: T, options?: Record<string, unknown>) {
	return Type.Unsafe({ type: "string", enum: values, ...options });
}

export { modelsAreEqual } from "@mariozechner/pi-ai";
