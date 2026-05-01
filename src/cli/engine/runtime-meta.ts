import type { CommandRuntime } from "../../types/index.js";

/**
 * Single source of truth for runtime-level system prerequisites.
 * Consumers (help, show, future features) derive runtime prerequisites from this map.
 *
 * playwright-cli used to require a manual "attach" step before every command run.
 * The runner now performs auto-attach on demand, so the prerequisite description
 * reflects only the persistent requirement (Chrome remote debugging enabled).
 */
export const RUNTIME_SYSTEM_PREREQUISITES: Record<CommandRuntime, string[] | undefined> = {
	node: undefined,
	shell: undefined,
	python: undefined,
	"playwright-cli": ["Requires Chrome remote debugging enabled; auto-attach will be attempted on first command"],
};
