import { unlinkSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDaemonStateDir, getSocketPath } from "../shared/paths.js";
import { DAEMON_LIMITS } from "./config/limits.js";
import { closeBrowser, drainPagePool, getOpenPageCount } from "./executor/browser-manager.js";
import {
	degraded,
	restartPending,
	setRestartPending,
	startMemoryMonitoring,
	stopMemoryMonitoring,
} from "./executor/memory-monitor.js";
import { createSocketServer, getExecutionCount } from "./executor/socket-server.js";
import { closeLogger, initLogger, logEvent } from "./observability/logger.js";
import { flushMetrics, recordPeakPages, recordPeakRss } from "./observability/metrics.js";

export { DAEMON_LIMITS } from "./config/limits.js";

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
			if (getExecutionCount() >= DAEMON_LIMITS.restartAfterExecutions) {
				setRestartPending(true);
			}
			recordPeakPages(getOpenPageCount());
			recordPeakRss(Math.round(process.memoryUsage().rss / 1024 / 1024));
		},
		isRestartPending: () => restartPending,
		isDegraded: () => degraded,
	});

	startMemoryMonitoring(
		() => {
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
		},
		() => drainPagePool(),
	);

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

	// Uncaught exceptions are logged and the daemon keeps running instead of
	// crashing the shared process. A single request-level error — including a
	// command bug that leaks an unhandled exception — must not take down every
	// concurrent session. The browser page pool can be rebuilt and the error is
	// observable via daemon.log.
	process.on("uncaughtException", (err) => {
		console.error("Uncaught exception:", err);
		logEvent("ERROR", "daemon_uncaught_exception", {
			message: err.message,
			stack: err.stack,
		});
	});

	// Unhandled rejections are logged and the daemon keeps running instead of
	// crashing. Node's default (throw mode) would crash the process; this
	// handler deliberately overrides it because the previous
	// graceful-shutdown-on-any-rejection let one command's fire-and-forget
	// promise (e.g. a stray page.waitForResponse that was never awaited) kill
	// the whole daemon and sever every concurrent browser session.
	process.on("unhandledRejection", (reason) => {
		console.error("Unhandled rejection:", reason);
		logEvent("ERROR", "daemon_unhandled_rejection", {
			message: (reason as Error)?.message ?? String(reason),
			stack: (reason as Error)?.stack,
		});
	});
}

main().catch((err) => {
	console.error("Daemon failed to start:", err);
	process.exit(1);
});
