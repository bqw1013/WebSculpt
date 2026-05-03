import { unlink } from "node:fs/promises";
import { DAEMON_JSON, isProcessAlive, readDaemonState } from "../engine/daemon/state.js";
import { sendRequest } from "../engine/daemon/transport.js";
import type { DaemonStopResult, MetaCommandError } from "../output.js";

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
