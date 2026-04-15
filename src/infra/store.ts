import { mkdir, readFile, writeFile } from "fs/promises";
import { CONFIG_FILE, LOG_FILE, USER_COMMANDS_DIR, WEBSCULPT_DIR } from "./paths.js";

/** Initializes the WebSculpt filesystem layout. Creates directories and a default config if missing. */
export async function initStore(): Promise<void> {
	await mkdir(WEBSCULPT_DIR, { recursive: true });
	await mkdir(USER_COMMANDS_DIR, { recursive: true });
	try {
		await readFile(CONFIG_FILE, "utf-8");
	} catch {
		// No config yet; seed a default one so downstream reads never fail.
		await writeFile(CONFIG_FILE, JSON.stringify({ version: "1" }, null, 2));
	}
}

/** Reads the global config object. Returns an empty object if the file does not exist. */
export async function readConfig(): Promise<any> {
	try {
		const raw = await readFile(CONFIG_FILE, "utf-8");
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

/** Writes the global config object, replacing the existing file. */
export async function writeConfig(config: any): Promise<void> {
	await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/** Appends a single log entry as a JSON line to the log file. */
export async function appendLog(entry: any): Promise<void> {
	const line = `${JSON.stringify(entry)}\n`;
	await writeFile(LOG_FILE, line, { flag: "a" });
}
