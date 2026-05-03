import { readFile, unlink } from "node:fs/promises";
import { getDaemonLogPath } from "../daemon/paths.js";
import { DAEMON_JSON, isProcessAlive, readDaemonState } from "../engine/daemon/state.js";
import { sendRequest } from "../engine/daemon/transport.js";
import type { DaemonLogsResult, DaemonStatusResult, DaemonStopResult, MetaCommandError } from "../output.js";

const STOP_POLL_INTERVAL_MS = 200;
const STOP_POLL_MAX_WAIT_MS = 6000;

/**
 * Sends a graceful stop request to the daemon, polls for process termination,
 * and falls back to SIGKILL if necessary. Always cleans up daemon.json.
 */
export async function handleDaemonStop(): Promise<DaemonStopResult | MetaCommandError> {
	const state = await readDaemonState();

	if (!state || !isProcessAlive(state.pid)) {
		await unlink(DAEMON_JSON).catch(() => {});
		return { success: true, message: "Daemon was not running" };
	}

	// Send graceful stop request if the daemon is reachable.
	try {
		await sendRequest(state.socketPath, "stop", {});
	} catch {
		// Ignore stop request errors; the daemon may already be shutting down
		// or unresponsive. Fall through to polling and force kill.
	}

	// Poll until the process exits or the timeout expires.
	const pollStart = Date.now();
	while (Date.now() - pollStart < STOP_POLL_MAX_WAIT_MS) {
		if (!isProcessAlive(state.pid)) {
			await unlink(DAEMON_JSON).catch(() => {});
			return { success: true, message: "Daemon stopped" };
		}
		await new Promise((r) => setTimeout(r, STOP_POLL_INTERVAL_MS));
	}

	// Process is still alive after polling timeout — force kill.
	try {
		process.kill(state.pid, "SIGKILL");
	} catch {
		// Ignore if the process disappeared between the last poll and the kill.
	}

	// Wait a brief moment for the OS to clean up the process.
	await new Promise((r) => setTimeout(r, STOP_POLL_INTERVAL_MS));

	await unlink(DAEMON_JSON).catch(() => {});

	if (isProcessAlive(state.pid)) {
		return {
			success: false,
			error: { code: "DAEMON_STOP_FAILED", message: "Failed to stop daemon: process resisted SIGKILL" },
		};
	}

	return { success: true, message: "Daemon killed forcefully" };
}

/**
 * Queries the running daemon's health endpoint and returns its current state.
 */
export async function handleDaemonStatus(): Promise<DaemonStatusResult | MetaCommandError> {
	const state = await readDaemonState();

	if (!state || !isProcessAlive(state.pid)) {
		return {
			success: false,
			error: { code: "DAEMON_NOT_RUNNING", message: "Daemon is not running" },
		};
	}

	try {
		const status = (await sendRequest(state.socketPath, "health", {})) as DaemonStatusResult["status"];
		return { success: true, status };
	} catch (err) {
		return {
			success: false,
			error: {
				code: "DAEMON_UNREACHABLE",
				message: `Daemon is running but unreachable: ${(err as Error).message}`,
			},
		};
	}
}

/**
 * Reads and returns recent entries from the daemon log file.
 */
export async function handleDaemonLogs(options: { lines?: number } = {}): Promise<DaemonLogsResult | MetaCommandError> {
	const logPath = getDaemonLogPath();
	const lineCount = options.lines ?? 50;

	try {
		const content = await readFile(logPath, "utf-8");
		const lines = content.split("\n").filter((l) => l.trim() !== "");
		return { success: true, lines: lines.slice(-lineCount) };
	} catch {
		return {
			success: false,
			error: { code: "NO_LOGS_AVAILABLE", message: "No daemon logs are available" },
		};
	}
}
