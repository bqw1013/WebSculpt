import type { CommandRuntime } from "../../types/index.js";

/**
 * Single source of truth for runtime-level system prerequisites.
 * Consumers (help, show, future features) derive runtime prerequisites from this map.
 */
export const RUNTIME_SYSTEM_PREREQUISITES: Record<CommandRuntime, string[] | undefined> = {
	node: undefined,
	shell: undefined,
	python: undefined,
	"playwright-cli": ["Requires Chrome remote debugging enabled; auto-attach will be attempted on first command"],
};
