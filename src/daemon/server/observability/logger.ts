import { createWriteStream } from "node:fs";
import { DAEMON_LOG_FILE } from "../../../infra/paths.js";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type LogEvent =
	| "daemon_start"
	| "daemon_shutdown"
	| "req_start"
	| "req_end"
	| "req_error"
	| "browser_connect"
	| "browser_disconnect"
	| "mem_high";

interface LogEntry {
	time: string;
	level: LogLevel;
	event: LogEvent;
	[key: string]: unknown;
}

let logStream: ReturnType<typeof createWriteStream> | null = null;

/**
 * Initializes the structured NDJSON logger, truncating the log file on start.
 */
export function initLogger(): void {
	const logPath = DAEMON_LOG_FILE;
	logStream = createWriteStream(logPath, { flags: "w" });
}

/**
 * Writes a structured NDJSON log entry to the daemon log file.
 */
export function logEvent(level: LogLevel, event: LogEvent, fields: Record<string, unknown> = {}): void {
	if (!logStream) return;
	const entry: LogEntry = {
		time: new Date().toISOString(),
		level,
		event,
		...fields,
	};
	logStream.write(`${JSON.stringify(entry)}\n`);
}

/**
 * Closes the log stream.
 */
export function closeLogger(): void {
	logStream?.end();
	logStream = null;
}
