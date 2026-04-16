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

/** Union of all meta command result shapes. */
export type MetaCommandResult =
	| CommandCreateResult
	| CommandRemoveResult
	| CommandListResult
	| ConfigInitResult
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
		for (const cmd of result.commands) {
			console.log(`${cmd.type} ${cmd.domain}/${cmd.action} (${cmd.id}) — ${cmd.description}`);
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
