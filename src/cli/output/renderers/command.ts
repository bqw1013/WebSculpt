import { formatRow, printKeyValue, printWarnings } from "../formatters.js";
import type {
	CommandCreateResult,
	CommandDomainsResult,
	CommandDraftResult,
	CommandExportResult,
	CommandImportResult,
	CommandListResult,
	CommandRemoveResult,
	CommandShowResult,
	CommandValidateResult,
	MetaCommandResult,
} from "../types.js";

export function isCommandDraftResult(r: MetaCommandResult): r is CommandDraftResult {
	return r.success && "draftPath" in r;
}

export function renderDraftResult(result: CommandDraftResult): void {
	console.log(`Draft created at ${result.draftPath}`);
	console.log("");
	console.log("Files:");
	for (const file of result.files) {
		console.log(`  ${file}`);
	}
	if (result.warnings && result.warnings.length > 0) {
		console.log("");
		printWarnings(result.warnings);
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
}

export function isCommandCreateResult(r: MetaCommandResult): r is CommandCreateResult {
	return r.success && "path" in r && typeof (r as CommandCreateResult).command === "string";
}

export function renderCreateResult(result: CommandCreateResult): void {
	console.log(`Created command ${result.command} at ${result.path}`);
	if (result.warnings && result.warnings.length > 0) {
		console.log("");
		printWarnings(result.warnings);
	}
}

export function isCommandListResult(r: MetaCommandResult): r is CommandListResult {
	return r.success && "commands" in r && Array.isArray((r as CommandListResult).commands);
}

export function renderListResult(result: CommandListResult): void {
	if (result.commands.length === 0) {
		console.log("No commands available.");
		return;
	}

	const rows = result.commands.map((cmd) => ({
		command: `websculpt ${cmd.domain} ${cmd.action}`,
		source: cmd.type,
		browser: cmd.requiresBrowser ? "yes" : "no",
		login: cmd.authRequired === "required" ? "yes" : cmd.authRequired === "not-required" ? "no" : "",
		description: cmd.description,
	}));

	const commandMaxWidth = Math.max("Command".length, ...rows.map((r) => r.command.length));
	const sourceMaxWidth = Math.max("Source".length, ...rows.map((r) => r.source.length));
	const browserMaxWidth = Math.max("Browser".length, ...rows.map((r) => r.browser.length));
	const loginMaxWidth = Math.max("Login".length, ...rows.map((r) => r.login.length));
	const widths = [commandMaxWidth, sourceMaxWidth, browserMaxWidth, loginMaxWidth];

	console.log(formatRow(["Command", "Source", "Browser", "Login", "Description"], widths));
	for (const [i, row] of rows.entries()) {
		console.log(formatRow([row.command, row.source, row.browser, row.login, row.description], widths));
		if (i < rows.length - 1) {
			console.log("");
		}
	}
}

export function isCommandDomainsResult(r: MetaCommandResult): r is CommandDomainsResult {
	return r.success && "domains" in r && Array.isArray((r as CommandDomainsResult).domains);
}

export function renderDomainsResult(result: CommandDomainsResult): void {
	if (result.domains.length === 0) {
		console.log("No domains available.");
		return;
	}

	console.log(`Domains (${result.domains.length}):`);
	const indent = "  ";
	const maxWidth = 80;
	let line = indent;
	for (const [i, domain] of result.domains.entries()) {
		const text = i < result.domains.length - 1 ? `${domain}, ` : domain;
		if (line !== indent && line.length + text.length > maxWidth) {
			console.log(line.trimEnd());
			line = indent;
		}
		line += text;
	}
	console.log(line.trimEnd());
}

export function isCommandShowResult(r: MetaCommandResult): r is CommandShowResult {
	return r.success && "command" in r && typeof (r as CommandShowResult).command === "object";
}

export function renderShowResult(result: CommandShowResult): void {
	const cmd = result.command;
	printKeyValue("id:", cmd.id);
	printKeyValue("domain:", cmd.domain);
	printKeyValue("action:", cmd.action);
	printKeyValue("description:", cmd.description);
	printKeyValue("runtime:", cmd.runtime);
	printKeyValue("source:", cmd.source);
	printKeyValue("path:", cmd.path);
	printKeyValue("entryFile:", cmd.entryFile);
	printKeyValue("requiresBrowser:", cmd.requiresBrowser ? "yes" : "no");
	if (cmd.authRequired !== undefined) {
		printKeyValue("authRequired:", cmd.authRequired);
	}
	console.log("");
	if (cmd.parameters.length > 0) {
		console.log("parameters:");
		const nameWidth = Math.max(10, ...cmd.parameters.map((p) => p.name.length));
		const reqWidth = Math.max(8, ...cmd.parameters.map((p) => (p.required ? "required" : "optional").length));
		for (const p of cmd.parameters) {
			const req = p.required ? "required" : "optional";
			const def = p.default !== undefined ? String(p.default) : "-";
			console.log(`  ${p.name.padEnd(nameWidth)} ${req.padEnd(reqWidth)} ${def.padEnd(10)} ${p.description ?? ""}`);
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
	if (result.readmeContent) {
		console.log("");
		console.log("--- README ---");
		console.log(result.readmeContent);
	}
}

export function isCommandValidateResult(r: MetaCommandResult): r is CommandValidateResult {
	return r.success && "warnings" in r && !("path" in r) && !("draftPath" in r);
}

export function renderValidationResult(result: CommandValidateResult): void {
	if (result.warnings && result.warnings.length > 0) {
		console.log("Validation passed with warnings:");
		for (const w of result.warnings) {
			console.log(`  [WARNING] ${w.code}: ${w.message}`);
		}
	} else {
		console.log("Validation passed");
	}
	if (result.message) {
		console.log(result.message);
	}
}

export function isCommandRemoveResult(r: MetaCommandResult): r is CommandRemoveResult {
	return r.success && "command" in r && typeof (r as CommandRemoveResult).command === "string" && !("path" in r);
}

export function renderRemoveResult(result: CommandRemoveResult): void {
	console.log(`Removed command ${result.command}`);
}

export function isCommandExportResult(r: MetaCommandResult): r is CommandExportResult {
	return r.success && "exported" in r && "to" in r;
}

export function renderExportResult(result: CommandExportResult): void {
	console.log(`Exported ${result.exported.length} command(s) to ${result.to}:`);
	for (const cmd of result.exported) {
		console.log(`  ${cmd}`);
	}
	if (result.warnings && result.warnings.length > 0) {
		console.log("");
		printWarnings(result.warnings);
	}
}

export function isCommandImportResult(r: MetaCommandResult): r is CommandImportResult {
	if (!r.success || !("results" in r) || !Array.isArray((r as CommandImportResult).results)) return false;
	const arr = (r as CommandImportResult).results;
	if (arr.length === 0) return true;
	const first = arr[0] as unknown as Record<string, unknown>;
	return "command" in first;
}

export function renderImportResult(result: CommandImportResult): void {
	const byStatus = {
		installed: result.results.filter((e) => e.status === "installed"),
		overwritten: result.results.filter((e) => e.status === "overwritten"),
		skipped: result.results.filter((e) => e.status === "skipped"),
	};

	if (byStatus.installed.length > 0) {
		console.log(`Installed ${byStatus.installed.length} command(s):`);
		for (const entry of byStatus.installed) {
			console.log(`  ${entry.command}`);
		}
	}

	if (byStatus.overwritten.length > 0) {
		if (byStatus.installed.length > 0) console.log("");
		console.log(`Overwritten ${byStatus.overwritten.length} command(s):`);
		for (const entry of byStatus.overwritten) {
			console.log(`  ${entry.command}`);
		}
	}

	if (byStatus.skipped.length > 0) {
		if (byStatus.installed.length > 0 || byStatus.overwritten.length > 0) console.log("");
		console.log(`Skipped ${byStatus.skipped.length} existing command(s):`);
		for (const entry of byStatus.skipped) {
			console.log(`  ${entry.command}`);
		}
	}
}
