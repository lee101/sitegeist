import type { AgentMessage } from "@mariozechner/pi-agent-core";

// Middle-out context compaction. Runs in Agent.transformContext before each LLM
// call so requests never exceed the model context window (no overflow errors).
// Non-destructive: returns a new view; agent.state.messages / UI are untouched.

const IMAGE_TOKENS = 1500;
const PER_MESSAGE_OVERHEAD = 8;
const TOOLS_RESERVE = 8000; // tool defs live in system, not in messages
const SAFETY = 2000;
const TRUNC_CAP_CHARS = 1500;
const PROTECTED_TAIL = 4; // never truncate the most recent messages

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

function estimateContentTokens(content: unknown): number {
	if (content == null) return 0;
	if (typeof content === "string") return Math.ceil(content.length / 4);
	if (Array.isArray(content)) {
		let t = 0;
		for (const b of content) {
			if (!b || typeof b !== "object") {
				t += Math.ceil(String(b).length / 4);
				continue;
			}
			const block = b as Record<string, any>;
			switch (block.type) {
				case "image":
					t += IMAGE_TOKENS;
					break;
				case "text":
					t += Math.ceil((block.text?.length || 0) / 4);
					break;
				case "thinking":
					t += Math.ceil((block.thinking?.length || 0) / 4);
					break;
				case "toolCall":
					t += Math.ceil((JSON.stringify(block.arguments || {}).length + (block.name?.length || 0)) / 4);
					break;
				default:
					t += Math.ceil(JSON.stringify(block).length / 4);
			}
		}
		return t;
	}
	return Math.ceil(JSON.stringify(content).length / 4);
}

export function estimateMessageTokens(m: AgentMessage): number {
	const anyM = m as Record<string, any>;
	let t = PER_MESSAGE_OVERHEAD;
	if ("content" in anyM) t += estimateContentTokens(anyM.content);
	if (anyM.role === "navigation") {
		t += Math.ceil(((anyM.skillsOutput?.length || 0) + (anyM.url?.length || 0) + (anyM.title?.length || 0)) / 4) + 80;
	}
	return t;
}

export function estimateTokens(ms: AgentMessage[]): number {
	let t = 0;
	for (const m of ms) t += estimateMessageTokens(m);
	return t;
}

function truncateContentBlocks(content: unknown): unknown {
	if (typeof content === "string") {
		return content.length > TRUNC_CAP_CHARS ? `${content.slice(0, TRUNC_CAP_CHARS)}\n[...truncated...]` : content;
	}
	if (!Array.isArray(content)) return content;
	return content.map((b) => {
		if (!b || typeof b !== "object") return b;
		const block = b as Record<string, any>;
		if (block.type === "image") return { type: "text", text: "[image omitted to fit context]" };
		if (block.type === "text" && (block.text?.length || 0) > TRUNC_CAP_CHARS) {
			return { ...block, text: `${block.text.slice(0, TRUNC_CAP_CHARS)}\n[...truncated...]` };
		}
		if (block.type === "thinking" && (block.thinking?.length || 0) > 500) {
			return { ...block, thinking: block.thinking.slice(0, 500) };
		}
		return block;
	});
}

export interface CompactionOptions {
	contextWindow: number;
	maxTokens?: number;
	systemPrompt?: string;
}

// Split into rounds at user-message boundaries. Tool calls and their results
// never span a user boundary, so dropping whole rounds keeps tool pairing valid.
function splitRounds(messages: AgentMessage[]): AgentMessage[][] {
	const rounds: AgentMessage[][] = [];
	for (const m of messages) {
		if ((m as { role?: string }).role === "user" || rounds.length === 0) {
			rounds.push([m]);
		} else {
			rounds[rounds.length - 1].push(m);
		}
	}
	return rounds;
}

export function compactMessages(messages: AgentMessage[], opts: CompactionOptions): AgentMessage[] {
	const ctx = opts.contextWindow;
	if (!ctx || ctx <= 0) return messages;

	const sysTokens = opts.systemPrompt ? estimateContentTokens(opts.systemPrompt) : 0;
	const out = clamp(opts.maxTokens ?? 8192, 4096, Math.floor(ctx * 0.25));
	const budget = Math.floor(ctx * 0.92) - out - sysTokens - TOOLS_RESERVE - SAFETY;
	if (budget <= 0) return messages;
	if (estimateTokens(messages) <= budget) return messages;

	const rounds = splitRounds(messages);
	if (rounds.length === 0) return messages;

	// Always keep the first round (original task) + a suffix of recent rounds.
	const head = rounds[0];
	const headTokens = estimateTokens(head);
	const keptTail: AgentMessage[][] = [];
	let tailTokens = 0;
	for (let i = rounds.length - 1; i >= 1; i--) {
		const rt = estimateTokens(rounds[i]);
		if (headTokens + tailTokens + rt > budget && keptTail.length > 0) break;
		keptTail.unshift(rounds[i]);
		tailTokens += rt;
		if (headTokens + tailTokens > budget) break; // forced last round, stop adding more
	}

	let result = rounds.length > 1 ? [...head, ...keptTail.flat()] : [...head];

	// Fallback: still over budget (head or last round individually too large) →
	// truncate large content blocks oldest-first, preserving message/pairing structure.
	if (estimateTokens(result) > budget) {
		result = result.slice();
		for (let i = 0; i < result.length - PROTECTED_TAIL && estimateTokens(result) > budget; i++) {
			const m = result[i] as Record<string, any>;
			if (!("content" in m)) continue;
			result[i] = { ...m, content: truncateContentBlocks(m.content) } as AgentMessage;
		}
	}

	return result;
}
