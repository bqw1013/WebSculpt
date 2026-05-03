import type { CommandParameter, ValidationDetail } from "../types/index.js";

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
	warnings?: ValidationDetail[];
}

/** Result shape for a validation error. */
export interface ValidationErrorResult {
	success: false;
	error: {
		code: "VALIDATION_ERROR";
		message: string;
		details: ValidationDetail[];
	};
}

/** Result shape for a successful command validation. */
export interface CommandValidateResult {
	success: true;
	warnings?: ValidationDetail[];
}

/** Result shape for a successful command removal. */
export interface CommandRemoveResult {
	success: true;
	command: string;
}

/** Result shape for a successful command draft. */
export interface CommandDraftResult {
	success: true;
	draftPath: string;
	files: string[];
	runtime: string;
	nextSteps: Array<{
		action: string;
		file?: string;
		command?: string;
	}>;
	warnings?: ValidationDetail[];
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

/** Result shape for a successful command show. */
export interface CommandShowResult {
	success: true;
	command: {
		id: string;
		domain: string;
		action: string;
		description: string;
		runtime: string;
		source: string;
		path: string;
		entryFile: string;
		parameters: CommandParameter[];
		prerequisites: string[];
		assets: {
			manifest: boolean;
			readme: boolean;
			context: boolean;
			entryFile: boolean;
		};
	};
	readmeContent?: string;
}

/** Result shape for a successful config init. */
export interface ConfigInitResult {
	success: true;
	message: string;
}

/** Result shape for a successful daemon stop. */
export interface DaemonStopResult {
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
	| DaemonStopResult
	| SkillInstallResult
	| SkillUninstallResult
	| SkillStatusResult
	| CommandValidateResult
	| ValidationErrorResult
	| CommandDraftResult
	| CommandShowResult
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
		if ("details" in result.error && Array.isArray(result.error.details)) {
			for (const detail of result.error.details) {
				console.log(`  [${detail.level.toUpperCase()}] ${detail.code}: ${detail.message}`);
			}
		}
		return;
	}

	if ("draftPath" in result) {
		console.log(`Draft created at ${result.draftPath}`);
		console.log("");
		console.log("Files:");
		for (const file of result.files) {
			console.log(`  ${file}`);
		}
		if (result.warnings && result.warnings.length > 0) {
			console.log("");
			console.log("Warnings:");
			for (const w of result.warnings) {
				console.log(`  [WARNING] ${w.code}: ${w.message}`);
			}
		}
		console.log("");
		console.log("Next steps:");
		for (const step of result.nextSteps) {
			if (step.file) {
				console.log(`  - ${step.action} (${step.file})`);
			} else if (step.command) {
				console.log(`  - ${step.action}: ${step.command}`);
			} else {
				console.log(`  - ${step.action}`);
			}
		}
		return;
	}

	if ("path" in result) {
		console.log(`Created command ${result.command} at ${result.path}`);
		if (result.warnings && result.warnings.length > 0) {
			console.log("");
			console.log("Warnings:");
			for (const w of result.warnings) {
				console.log(`  [WARNING] ${w.code}: ${w.message}`);
			}
		}
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

	if ("results" in result && Array.isArray(result.results) && result.results.length > 0) {
		const firstResult = result.results[0];
		if (firstResult && "agent" in firstResult && "status" in firstResult) {
			for (const r of result.results) {
				console.log(`${r.agent}: ${r.status}`);
			}
			return;
		}
	}

	if ("message" in result) {
		console.log(result.message);
		return;
	}

	if ("warnings" in result && !("path" in result)) {
		if (result.warnings && result.warnings.length > 0) {
			console.log("Validation passed with warnings:");
			for (const w of result.warnings) {
				console.log(`  [WARNING] ${w.code}: ${w.message}`);
			}
		} else {
			console.log("Validation passed");
		}
		return;
	}

	if ("command" in result && typeof result.command === "object") {
		const cmd = result.command;
		const labelWidth = 12;
		const pad = (s: string) => s.padEnd(labelWidth);
		console.log(`${pad("id:")}${cmd.id}`);
		console.log(`${pad("domain:")}${cmd.domain}`);
		console.log(`${pad("action:")}${cmd.action}`);
		console.log(`${pad("description:")}${cmd.description}`);
		console.log(`${pad("runtime:")}${cmd.runtime}`);
		console.log(`${pad("source:")}${cmd.source}`);
		console.log(`${pad("path:")}${cmd.path}`);
		console.log(`${pad("entryFile:")}${cmd.entryFile}`);
		console.log("");
		if (cmd.parameters.length > 0) {
			console.log("parameters:");
			const nameWidth = Math.max(10, ...cmd.parameters.map((p) => p.name.length));
			const reqWidth = Math.max(8, ...cmd.parameters.map((p) => (p.required ? "required" : "optional").length));
			for (const p of cmd.parameters) {
				const req = p.required ? "required" : "optional";
				const def = p.default !== undefined ? String(p.default) : "-";
				console.log(
					`  ${p.name.padEnd(nameWidth)} ${req.padEnd(reqWidth)} ${def.padEnd(10)} ${p.description ?? ""}`,
				);
			}
			console.log("");
		}
		if (cmd.prerequisites.length > 0) {
			console.log("prerequisites:");
			for (const p of cmd.prerequisites) {
				console.log(`  ${p}`);
			}
			console.log("");
		}
		console.log("assets:");
		const assetWidth = Math.max(10, ...Object.keys(cmd.assets).map((k) => k.length));
		for (const [key, value] of Object.entries(cmd.assets)) {
			console.log(`  ${key.padEnd(assetWidth)} ${value ? "yes" : "no"}`);
		}
		if ("readmeContent" in result && result.readmeContent) {
			console.log("");
			console.log("--- README ---");
			console.log(result.readmeContent);
		}
		return;
	}

	if ("command" in result) {
		console.log(`Removed command ${result.command}`);
		return;
	}
}
