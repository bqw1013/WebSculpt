import { unlinkSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDaemonStateDir, getSocketPath } from "./config/paths.js";
import { closeLogger, initLogger, logEvent } from "./observability/logger.js";
import { flushMetrics, recordPeakPages, recordPeakRss } from "./observability/metrics.js";
import { closeBrowser, getOpenPageCount } from "./runtime/browser-manager.js";
import {
	degraded,
	restartPending,
	setRestartPending,
	startMemoryMonitoring,
	stopMemoryMonitoring,
} from "./runtime/memory-monitor.js";
import { createSocketServer, getExecutionCount } from "./runtime/socket-server.js";

export { DAEMON_LIMITS } from "./config/limits.js";

const MAX_EXECUTIONS_BEFORE_RESTART = 200;

let server: ReturnType<typeof createSocketServer>;
let isShuttingDown = false;

export async function gracefulShutdown(reason: string = "stop"): Promise<void> {
	if (isShuttingDown) {
		return;
	}
	isShuttingDown = true;

	try {
		stopMemoryMonitoring();

		logEvent("INFO", "daemon_shutdown", { reason });

		// Flush metrics before cleanup so the session summary is persisted.
		await flushMetrics(reason);

		// Delete state file first so stale PID is never left on disk,
		// regardless of which subsequent step hangs or fails.
		try {
			await unlink(join(getDaemonStateDir(), "daemon.json"));
		} catch {
			// Ignore if the state file does not exist or is not writable.
		}

		try {
			await closeBrowser();
		} catch {
			// Ignore browser close errors during shutdown.
		}
		try {
			server?.close(() => {
				process.exit(0);
			});
		} catch {
			// Ignore server close errors.
		}
		closeLogger();
		// Force exit if server close hangs.
		setTimeout(() => process.exit(0), 5000);
	} finally {
		isShuttingDown = false;
	}
}

async function main(): Promise<void> {
	const stateDir = getDaemonStateDir();
	await mkdir(stateDir, { recursive: true });

	initLogger();
	logEvent("INFO", "daemon_start", { pid: process.pid, socketPath: getSocketPath() });

	const socketPath = getSocketPath();

	// Clean up an existing Unix domain socket file to avoid EADDRINUSE.
	if (process.platform !== "win32") {
		try {
			await unlink(socketPath);
		} catch {
			// Ignore if the socket file does not exist.
		}
	}

	server = createSocketServer(socketPath, {
		onStop: () => gracefulShutdown("stop"),
		onActivity: () => {
			if (getExecutionCount() >= MAX_EXECUTIONS_BEFORE_RESTART) {
				setRestartPending(true);
			}
			recordPeakPages(getOpenPageCount());
			recordPeakRss(Math.round(process.memoryUsage().rss / 1024 / 1024));
		},
		isRestartPending: () => restartPending,
		isDegraded: () => degraded,
	});

	startMemoryMonitoring(() => {
		if (isShuttingDown) {
			return;
		}
		isShuttingDown = true;

		try {
			unlinkSync(join(getDaemonStateDir(), "daemon.json"));
		} catch {
			// Ignore errors during emergency cleanup.
		}
		logEvent("ERROR", "daemon_shutdown", { reason: "memory_emergency" });
		process.exit(1);
	});

	// Persist daemon state so CLI processes can discover this instance.
	// On Windows the CLI launcher (WScript.Shell COM object) cannot obtain
	// the child PID, so the daemon writes its own state file.
	const state = { pid: process.pid, socketPath };
	await writeFile(join(stateDir, "daemon.json"), JSON.stringify(state, null, 2), "utf-8");

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			console.error("Socket already in use, another daemon instance is running. Exiting.");
			process.exit(0);
		}
		console.error("Server error:", err);
		gracefulShutdown("error");
	});

	// Graceful shutdown on termination signals.
	process.on("SIGTERM", () => gracefulShutdown("signal"));
	process.on("SIGINT", () => gracefulShutdown("signal"));

	// Log uncaught exceptions and initiate graceful shutdown.
	process.on("uncaughtException", (err) => {
		console.error("Uncaught exception:", err);
		gracefulShutdown("error");
	});

	// Log unhandled rejections and initiate graceful shutdown.
	process.on("unhandledRejection", (reason) => {
		console.error("Unhandled rejection:", reason);
		gracefulShutdown("error");
	});
}

main().catch((err) => {
	console.error("Daemon failed to start:", err);
	process.exit(1);
});
