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
 * Converts any runtime string to a valid CommandRuntime.
 * Falls back to "node" when the input is missing or unrecognized.
 */
export function normalizeRuntime(runtime: string | undefined): CommandRuntime {
	if (runtime && VALID_RUNTIMES.includes(runtime as CommandRuntime)) {
		return runtime as CommandRuntime;
	}
	return "node";
}

/**
 * Determines whether a given runtime requires a browser environment.
 */
export function runtimeRequiresBrowser(runtime: string): boolean {
	return runtime === "playwright-cli";
}

/**
 * Reports whether a runtime is currently executable by the CLI.
 */
export function isExecutable(runtime: string): boolean {
	return runtime === "node" || runtime === "playwright-cli";
}

/**
 * Identifies runtimes whose entry files are JavaScript and therefore
 * require syntax checking and export validation.
 */
export function isJsBased(runtime: string): boolean {
	return runtime === "node" || runtime === "playwright-cli";
}

/**
 * Export contract for a given runtime.
 */
export interface ExportContract {
	/** Whether `export default` is required. */
	requireDefault: boolean;
	/** Whether named `command` exports are allowed. */
	allowNamedCommand: boolean;
}

/**
 * Returns the export contract for a given runtime, indicating whether
 * `export default` is required and whether named `command` exports are allowed.
 */
export function getExportContract(runtime: string): ExportContract {
	switch (runtime) {
		case "node":
			return { requireDefault: false, allowNamedCommand: true };
		case "playwright-cli":
			return { requireDefault: true, allowNamedCommand: false };
		default:
			return { requireDefault: false, allowNamedCommand: false };
	}
}

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
