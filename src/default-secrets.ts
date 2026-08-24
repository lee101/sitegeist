/**
 * Built-in fallback API keys, used when the user has not stored their own key
 * for a provider in Settings > API keys. Fill in locally before building;
 * do not commit real secrets to a public fork.
 */
export const DEFAULT_PROVIDER_SECRETS: Record<string, string> = {
	openrouter: "",
};

export function getDefaultSecret(provider: string): string | undefined {
	const secret = DEFAULT_PROVIDER_SECRETS[provider];
	return secret ? secret : undefined;
}
