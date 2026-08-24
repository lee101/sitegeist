import { type Api, createModels, type Model } from "@mariozechner/pi-ai";

const registry = createModels();

export function getModel(provider: string, id: string): Model<Api> | undefined {
	return registry.getModel(provider, id);
}

export function getModels(provider?: string): readonly Model<Api>[] {
	return registry.getModels(provider);
}

export function getProviderIds(): string[] {
	return registry.getProviders().map((provider) => provider.id);
}
