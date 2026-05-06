import { spawnSync } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import type { Command } from "commander";
import { getDaemonLogPath } from "../../daemon/server/config/paths.js";
import { ensureDaemonClient } from "../../daemon/client/lifecycle.js";
import { DAEMON_JSON, isProcessAlive, readDaemonState } from "../../daemon/client/state.js";
import { sendRequest } from "../../daemon/client/transport.js";
import type {
	DaemonLogsResult,
	DaemonRestartResult,
	DaemonStartResult,
	DaemonStatusResult,
	DaemonStopResult,
	MetaCommandError,
} from "../output.js";
import { renderOutput } from "../output.js";
import { getFormat } from "./shared.js";

const STOP_POLL_INTERVAL_MS = 200;
const STOP_POLL_MAX_WAIT_MS = 10000;
const SIGKILL_CONFIRM_MAX_WAIT_MS = 3000;
const RESTART_COOLDOWN_MS = 500;

/**
 * Forcefully terminates a process.
 * On Windows, uses `taskkill /F /T` to terminate the entire process tree.
 * On Unix/macOS, falls back to `SIGKILL`.
 */
function forceKill(pid: number): void {
	if (process.platform === "win32") {
		const result = spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
		if (result.status === 0) {
			return;
		}
		// taskkill failed (e.g., process already gone); fall through to process.kill.
	}
	process.kill(pid, "SIGKILL");
}

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

	// Process is still alive after polling timeout �?force kill.
	try {
		forceKill(state.pid);
	} catch {
		// Ignore if the process disappeared between the last poll and the kill.
	}

	// Poll until the process exits or the SIGKILL confirmation timeout expires.
	const sigkillStart = Date.now();
	while (Date.now() - sigkillStart < SIGKILL_CONFIRM_MAX_WAIT_MS) {
		if (!isProcessAlive(state.pid)) {
			await unlink(DAEMON_JSON).catch(() => {});
			return { success: true, message: "Daemon killed forcefully" };
		}
		await new Promise((r) => setTimeout(r, STOP_POLL_INTERVAL_MS));
	}

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
 * Starts the daemon if it is not already running.
 */
export async function handleDaemonStart(): Promise<DaemonStartResult | MetaCommandError> {
	const state = await readDaemonState();

	if (state && isProcessAlive(state.pid)) {
		try {
			await sendRequest(state.socketPath, "health", {});
			return { success: true, message: "Daemon already running" };
		} catch {
			// Daemon is alive but unreachable; fall through to restart.
		}
	}

	try {
		await ensureDaemonClient();
		return { success: true, message: "Daemon started" };
	} catch (err) {
		return {
			success: false,
			error: { code: "DAEMON_START_FAILED", message: `Failed to start daemon: ${(err as Error).message}` },
		};
	}
}

/**
 * Restarts the daemon by stopping it and then starting a fresh instance.
 */
export async function handleDaemonRestart(): Promise<DaemonRestartResult | MetaCommandError> {
	const stopResult = await handleDaemonStop();
	if (!stopResult.success) {
		return stopResult as MetaCommandError;
	}

	// Cooldown to allow the OS to release sockets and other resources.
	await new Promise((r) => setTimeout(r, RESTART_COOLDOWN_MS));

	try {
		await ensureDaemonClient();
		return { success: true, message: "Daemon restarted" };
	} catch (err) {
		return {
			success: false,
			error: {
				code: "DAEMON_START_FAILED",
				message: `Daemon stopped but failed to start: ${(err as Error).message}`,
			},
		};
	}
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

/** Registers daemon sub-commands on the given program. */
export function registerDaemonMeta(program: Command): void {
	const format = (): "human" | "json" => getFormat(program);
	const daemon = program.command("daemon").description("Manage the background browser daemon");

	daemon
		.command("status")
		.description("Show daemon health and resource status")
		.action(async () => {
			const result = await handleDaemonStatus();
			renderOutput(result, format());
			if (!result.success) {
				process.exitCode = 1;
			}
		});

	daemon
		.command("logs")
		.description("Show recent daemon log entries")
		.option("--lines <n>", "Number of lines to show", (val) => Number.parseInt(val, 10))
		.action(async (options: { lines?: number }) => {
			const result = await handleDaemonLogs({ lines: options.lines });
			renderOutput(result, format());
			if (!result.success) {
				process.exitCode = 1;
			}
		});

	daemon
		.command("start")
		.description("Start the background daemon if not already running")
		.action(async () => {
			renderOutput(await handleDaemonStart(), format());
		});

	daemon
		.command("restart")
		.description("Restart the background daemon")
		.action(async () => {
			renderOutput(await handleDaemonRestart(), format());
		});

	daemon
		.command("stop")
		.description("Stop the running daemon process")
		.action(async () => {
			renderOutput(await handleDaemonStop(), format());
		});
}
