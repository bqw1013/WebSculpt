import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AUDIT_FILE, CONFIG_FILE, LOG_FILE, USER_COMMANDS_DIR, WEBSCULPT_DIR } from "./paths.js";

export interface Config {
	version?: string;
	cdpProxyPort?: number;
	[key: string]: unknown;
}

export interface LogEntry {
	time: string;
	domain: string;
	action: string;
	result: unknown;
}

export interface AuditEntry {
	timestamp: string;
	event: "install" | "overwrite";
	domain: string;
	action: string;
	sourcePath: string;
}

/** Initializes the WebSculpt filesystem layout. Creates directories and a default config if missing. */
export async function initStore(): Promise<void> {
	await mkdir(WEBSCULPT_DIR, { recursive: true });
	await mkdir(USER_COMMANDS_DIR, { recursive: true });

	// Ensure package.json exists so that user command entry files (.js)
	// containing ESM syntax are correctly interpreted on all supported
	// Node.js versions (including v20 without automatic module detection).
	const pkgPath = join(WEBSCULPT_DIR, "package.json");
	try {
		await readFile(pkgPath, "utf-8");
	} catch {
		await writeFile(pkgPath, JSON.stringify({ type: "module" }, null, 2));
	}

	try {
		await readFile(CONFIG_FILE, "utf-8");
	} catch {
		// No config yet; seed a default one so downstream reads never fail.
		await writeFile(CONFIG_FILE, JSON.stringify({ version: "1" }, null, 2));
	}
}

/** Reads the global config object. Returns an empty object if the file does not exist. */
export async function readConfig(): Promise<Config> {
	try {
		const raw = await readFile(CONFIG_FILE, "utf-8");
		return JSON.parse(raw) as Config;
	} catch {
		return {};
	}
}

/** Writes the global config object, replacing the existing file. */
export async function writeConfig(config: Config): Promise<void> {
	await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/** Appends a single log entry as a JSON line to the log file. */
export async function appendLog(entry: LogEntry): Promise<void> {
	const line = `${JSON.stringify(entry)}\n`;
	await writeFile(LOG_FILE, line, { flag: "a" });
}

/** Appends a single audit entry as a JSON line to the audit file. */
export async function appendAuditLog(entry: AuditEntry): Promise<void> {
	const line = `${JSON.stringify(entry)}\n`;
	await writeFile(AUDIT_FILE, line, { flag: "a" });
}
