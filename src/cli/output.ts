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
		requiresBrowser: boolean;
		authRequired?: "required" | "not-required" | "unknown";
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
		requiresBrowser: boolean;
		authRequired?: "required" | "not-required" | "unknown";
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

/** Runtime health status returned by the daemon health endpoint. */
export interface DaemonHealthStatus {
	pid: number;
	uptime: number;
	healthy: boolean;
	degraded: boolean;
	browser: {
		connected: boolean;
		lazy: boolean;
		pages: number;
	};
	sessions: {
		active: number;
		max: number;
		total: number;
	};
	resources: {
		rssMB: number;
		heapUsedMB: number;
		heapTotalMB: number;
	};
	limits: {
		commandTimeoutSec: number;
		maxConcurrentSessions: number;
		maxTotalPages: number;
		memoryWarningMB: number;
		memoryLimitMB: number;
		restartAfterExecutions: number;
	};
}

/** Result shape for a successful daemon status query. */
export interface DaemonStatusResult {
	success: true;
	status: DaemonHealthStatus;
}

/** Result shape for a successful daemon logs query. */
export interface DaemonLogsResult {
	success: true;
	lines: string[];
}

/** Result shape for a successful daemon start. */
export interface DaemonStartResult {
	success: true;
	message: string;
}

/** Result shape for a successful daemon restart. */
export interface DaemonRestartResult {
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
	| DaemonStatusResult
	| DaemonLogsResult
	| SkillInstallResult
	| SkillUninstallResult
	| SkillStatusResult
	| CommandValidateResult
	| ValidationErrorResult
	| CommandDraftResult
	| CommandShowResult
	| MetaCommandError;

// ---------------------------------------------------------------------------
// Internal formatting helpers
// ---------------------------------------------------------------------------

/** Formats uptime in full precision (e.g. "1h 59m 59s", "5m 3s", "42s"). */
function formatUptime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const parts: string[] = [];
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (s > 0 || parts.length === 0) parts.push(`${s}s`);
	return parts.join(" ");
}

/** Joins string values padded to fixed column widths. */
function formatRow(values: string[], widths: number[], padding = 2): string {
	return values.map((v, i) => v.padEnd((widths[i] ?? 0) + padding)).join("");
}

/** Prints a label-value pair with the label padded to 12 characters. */
function printKeyValue(label: string, value: string): void {
	console.log(`${label.padEnd(12)}${value}`);
}

/** Prints a list of validation warnings. */
function printWarnings(warnings: ValidationDetail[]): void {
	console.log("Warnings:");
	for (const w of warnings) {
		console.log(`  [${w.level.toUpperCase()}] ${w.code}: ${w.message}`);
	}
}

// ---------------------------------------------------------------------------
// Public utilities
// ---------------------------------------------------------------------------

/** Prints a value as pretty-printed JSON to stdout. */
export function printJson(data: unknown): void {
	try {
		console.log(JSON.stringify(data, null, 2));
	} catch (err) {
		console.error("Failed to serialize output:", err instanceof Error ? err.message : String(err));
	}
}

// ---------------------------------------------------------------------------
// Type guards for discriminating MetaCommandResult members
// ---------------------------------------------------------------------------

function isMetaCommandError(r: MetaCommandResult): r is MetaCommandError | ValidationErrorResult {
	return !r.success;
}

function isCommandDraftResult(r: MetaCommandResult): r is CommandDraftResult {
	return r.success && "draftPath" in r;
}

function isCommandCreateResult(r: MetaCommandResult): r is CommandCreateResult {
	return r.success && "path" in r && typeof (r as CommandCreateResult).command === "string";
}

function isCommandListResult(r: MetaCommandResult): r is CommandListResult {
	return r.success && "commands" in r && Array.isArray((r as CommandListResult).commands);
}

function isDaemonStatusResult(r: MetaCommandResult): r is DaemonStatusResult {
	return r.success && "status" in r && typeof (r as DaemonStatusResult).status === "object";
}

function isLinesResult(r: MetaCommandResult): r is DaemonLogsResult | SkillStatusResult {
	return r.success && "lines" in r && Array.isArray((r as DaemonLogsResult).lines);
}

function isSkillResults(r: MetaCommandResult): r is SkillInstallResult | SkillUninstallResult {
	return r.success && "results" in r && Array.isArray((r as SkillInstallResult).results);
}

function isMessageResult(
	r: MetaCommandResult,
): r is ConfigInitResult | DaemonStopResult | DaemonStartResult | DaemonRestartResult {
	return r.success && "message" in r && typeof (r as ConfigInitResult).message === "string";
}

function isCommandValidateResult(r: MetaCommandResult): r is CommandValidateResult {
	return r.success && "warnings" in r && !("path" in r) && !("draftPath" in r);
}

function isCommandShowResult(r: MetaCommandResult): r is CommandShowResult {
	return r.success && "command" in r && typeof (r as CommandShowResult).command === "object";
}

function isCommandRemoveResult(r: MetaCommandResult): r is CommandRemoveResult {
	return r.success && "command" in r && typeof (r as CommandRemoveResult).command === "string" && !("path" in r);
}

// ---------------------------------------------------------------------------
// Individual human-format renderers
// ---------------------------------------------------------------------------

function renderError(result: MetaCommandError | ValidationErrorResult): void {
	console.log(`${result.error.code}: ${result.error.message}`);
	if ("details" in result.error && Array.isArray(result.error.details)) {
		for (const detail of result.error.details) {
			console.log(`  [${detail.level.toUpperCase()}] ${detail.code}: ${detail.message}`);
		}
	}
}

function renderDraftResult(result: CommandDraftResult): void {
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

function renderCreateResult(result: CommandCreateResult): void {
	console.log(`Created command ${result.command} at ${result.path}`);
	if (result.warnings && result.warnings.length > 0) {
		console.log("");
		printWarnings(result.warnings);
	}
}

function renderListResult(result: CommandListResult): void {
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
	for (const row of rows) {
		console.log(formatRow([row.command, row.source, row.browser, row.login, row.description], widths));
	}
}

function renderShowResult(result: CommandShowResult): void {
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

function renderDaemonStatus(result: DaemonStatusResult): void {
	const s = result.status;
	console.log("Daemon Status");
	console.log("=============");
	printKeyValue("PID:", String(s.pid));
	printKeyValue("Uptime:", formatUptime(s.uptime));
	printKeyValue("Healthy:", s.healthy ? "yes" : "no");
	printKeyValue("Degraded:", s.degraded ? "yes" : "no");
	console.log("");
	console.log("Browser");
	printKeyValue("  Connected:", s.browser.connected ? "yes" : "no");
	printKeyValue("  Pages:", String(s.browser.pages));
	console.log("");
	console.log("Sessions");
	printKeyValue("  Active:", `${s.sessions.active} / ${s.sessions.max}`);
	printKeyValue("  Total:", String(s.sessions.total));
	console.log("");
	console.log("Resources");
	printKeyValue("  RSS:", `${s.resources.rssMB} MB`);
	printKeyValue("  Heap:", `${s.resources.heapUsedMB} / ${s.resources.heapTotalMB} MB`);
	console.log("");
	console.log("Limits");
	printKeyValue("  Command timeout:", `${Math.floor(s.limits.commandTimeoutSec / 60)} min`);
	printKeyValue("  Max sessions:", String(s.limits.maxConcurrentSessions));
	printKeyValue("  Max pages:", String(s.limits.maxTotalPages));
	printKeyValue("  Restart after:", `${s.limits.restartAfterExecutions} executions`);
	if (s.degraded) {
		console.log("");
		console.log("WARNING: Daemon is degraded");
	}
}

function renderLines(lines: string[]): void {
	for (const line of lines) {
		console.log(line);
	}
}

function renderSkillResults(result: SkillInstallResult | SkillUninstallResult): void {
	for (const r of result.results) {
		console.log(`${r.agent}: ${r.status}`);
	}
}

function renderMessageResult(
	result: ConfigInitResult | DaemonStopResult | DaemonStartResult | DaemonRestartResult,
): void {
	console.log(result.message);
}

function renderValidationResult(result: CommandValidateResult): void {
	if (result.warnings && result.warnings.length > 0) {
		console.log("Validation passed with warnings:");
		for (const w of result.warnings) {
			console.log(`  [WARNING] ${w.code}: ${w.message}`);
		}
	} else {
		console.log("Validation passed");
	}
}

function renderRemoveResult(result: CommandRemoveResult): void {
	console.log(`Removed command ${result.command}`);
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/** Renders a meta command result as either human-readable text or JSON. */
export function renderOutput(result: MetaCommandResult, format: OutputFormat): void {
	if (format === "json") {
		printJson(result);
		return;
	}

	if (isMetaCommandError(result)) {
		renderError(result);
		return;
	}

	if (isCommandDraftResult(result)) {
		renderDraftResult(result);
		return;
	}

	if (isCommandCreateResult(result)) {
		renderCreateResult(result);
		return;
	}

	if (isCommandListResult(result)) {
		renderListResult(result);
		return;
	}

	if (isDaemonStatusResult(result)) {
		renderDaemonStatus(result);
		return;
	}

	if (isLinesResult(result)) {
		renderLines(result.lines);
		return;
	}

	if (isSkillResults(result)) {
		renderSkillResults(result);
		return;
	}

	if (isMessageResult(result)) {
		renderMessageResult(result);
		return;
	}

	if (isCommandValidateResult(result)) {
		renderValidationResult(result);
		return;
	}

	if (isCommandShowResult(result)) {
		renderShowResult(result);
		return;
	}

	if (isCommandRemoveResult(result)) {
		renderRemoveResult(result);
		return;
	}

	console.warn("[renderOutput] Unhandled result type:");
	printJson(result);
}
