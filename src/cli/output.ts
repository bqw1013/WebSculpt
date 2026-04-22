/** Output format for meta command results. */
export type OutputFormat = "human" | "json";

/** Normalized error result returned by meta command handlers on failure. */
export interface MetaCommandError {
	success: false;
	error: {
		code: string;
		message: string;
	};
}

/** Result shape for a successful command creation. */
export interface CommandCreateResult {
	success: true;
	command: string;
	path: string;
}

/** Result shape for a successful command removal. */
export interface CommandRemoveResult {
	success: true;
	command: string;
}

/** Result shape for a successful command list. */
export interface CommandListResult {
	success: true;
	commands: Array<{
		domain: string;
		action: string;
		type: string;
		id: string;
		description: string;
	}>;
}

/** Result shape for a successful config init. */
export interface ConfigInitResult {
	success: true;
	message: string;
}

/** Result shape for a successful skill install. */
export interface SkillInstallResult {
	success: true;
	results: Array<{ agent: string; status: "installed" | "skipped" | "replaced" }>;
}

/** Result shape for a successful skill uninstall. */
export interface SkillUninstallResult {
	success: true;
	results: Array<{ agent: string; status: "removed" | "not_found" }>;
}

/** Result shape for a successful skill status. */
export interface SkillStatusResult {
	success: true;
	lines: string[];
}

/** Union of all meta command result shapes. */
export type MetaCommandResult =
	| CommandCreateResult
	| CommandRemoveResult
	| CommandListResult
	| ConfigInitResult
	| SkillInstallResult
	| SkillUninstallResult
	| SkillStatusResult
	| MetaCommandError;

/** Prints a value as pretty-printed JSON to stdout. */
export function printJson(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

/** Renders a meta command result as either human-readable text or JSON. */
export function renderOutput(result: MetaCommandResult, format: OutputFormat): void {
	if (format === "json") {
		printJson(result);
		return;
	}

	if (!result.success) {
		console.log(`${result.error.code}: ${result.error.message}`);
		return;
	}

	if ("path" in result) {
		console.log(`Created command ${result.command} at ${result.path}`);
		return;
	}

	if ("commands" in result) {
		if (result.commands.length === 0) {
			console.log("No commands available.");
			return;
		}

		const rows = result.commands.map((cmd) => ({
			command: `websculpt ${cmd.domain} ${cmd.action}`,
			source: cmd.type,
			description: cmd.description,
		}));

		const commandMaxWidth = Math.max("Command".length, ...rows.map((r) => r.command.length));
		const sourceMaxWidth = Math.max("Source".length, ...rows.map((r) => r.source.length));

		const pad = (s: string, width: number) => s.padEnd(width + 2);

		console.log(`${pad("Command", commandMaxWidth)}${pad("Source", sourceMaxWidth)}Description`);
		for (const row of rows) {
			console.log(`${pad(row.command, commandMaxWidth)}${pad(row.source, sourceMaxWidth)}${row.description}`);
		}
		return;
	}

	if ("lines" in result && Array.isArray(result.lines)) {
		for (const line of result.lines) {
			console.log(line);
		}
		return;
	}

	if (
		"results" in result &&
		Array.isArray(result.results) &&
		result.results.length > 0 &&
		"agent" in result.results[0] &&
		"status" in result.results[0]
	) {
		for (const r of result.results) {
			console.log(`${r.agent}: ${r.status}`);
		}
		return;
	}

	if ("message" in result) {
		console.log(result.message);
		return;
	}

	if ("command" in result) {
		console.log(`Removed command ${result.command}`);
		return;
	}
}
