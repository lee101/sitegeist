import type {
	AgentTool,
	AgentToolResult,
	AgentToolUpdateCallback,
	ToolExecutionMode,
} from "@mariozechner/pi-agent-core";
import type { ConstrainedSamplingConfig, TSchema } from "@mariozechner/pi-ai";

/**
 * Structural shape of sitegeist tool classes: `execute` is typed against the
 * tool's concrete schema params, which the runtime's widened AgentTool
 * (`params: unknown`) would otherwise reject under strict function variance.
 */
type ToolDefinition<TDetails> = {
	name: string;
	label: string;
	description: string;
	parameters: TSchema;
	prepareArguments?: (args: unknown) => unknown;
	executionMode?: ToolExecutionMode;
	constrainedSampling?: false | ConstrainedSamplingConfig;
	execute: (
		toolCallId: string,
		args: any,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TDetails>,
	) => Promise<AgentToolResult<TDetails>>;
};

/**
 * Adapt a concretely-typed tool definition (class instance or literal) to the
 * runtime's widened AgentTool shape, mirroring upstream coding-agent's wrapper.
 */
export function wrapToolDefinition<TDetails>(definition: ToolDefinition<TDetails>): AgentTool<any, TDetails> {
	return {
		name: definition.name,
		label: definition.label,
		description: definition.description,
		parameters: definition.parameters,
		prepareArguments: definition.prepareArguments,
		executionMode: definition.executionMode,
		constrainedSampling: definition.constrainedSampling,
		execute: (toolCallId, params, signal, onUpdate) => definition.execute(toolCallId, params, signal, onUpdate),
	};
}
