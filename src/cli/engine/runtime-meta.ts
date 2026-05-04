import type { CommandRuntime } from "../../types/index.js";

/**
 * Single source of truth for runtime-level system prerequisites.
 * Consumers (help, show, future features) derive runtime prerequisites from this map.
 */
export const RUNTIME_SYSTEM_PREREQUISITES: Record<CommandRuntime, string[] | undefined> = {
	node: undefined,
	shell: undefined,
	python: undefined,
	"playwright-cli": ["Requires `playwright-cli attach --cdp=chrome|msedge --session=default`"],
};

/**
 * Maps each supported runtime to its expected entry file name.
 */
export const RUNTIME_ENTRY_FILES: Record<CommandRuntime, string> = {
	node: "command.js",
	shell: "command.sh",
	python: "command.py",
	"playwright-cli": "command.js",
};

/**
 * Ordered list of all supported command runtimes.
 */
export const VALID_RUNTIMES: CommandRuntime[] = ["node", "playwright-cli", "shell", "python"];

/**
 * Resolves the entry file name for a given runtime.
 * Defaults to "command.js" for unknown runtimes.
 */
export function resolveEntryFile(runtime: string | undefined): string {
	switch (runtime) {
		case "shell":
			return "command.sh";
		case "python":
			return "command.py";
		default:
			return "command.js";
	}
}
