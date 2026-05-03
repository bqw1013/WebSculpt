import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { closeBrowser } from "./browser-manager.js";
import { getDaemonLogPath, getDaemonStateDir, getSocketPath } from "./paths.js";
import { createSocketServer, getExecutionCount } from "./socket-server.js";

const MAX_EXECUTIONS_BEFORE_RESTART = 200;

let server: ReturnType<typeof createSocketServer>;
let logStream: WriteStream | null = null;
let restartPending = false;

export async function gracefulShutdown(): Promise<void> {
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
	if (logStream) {
		logStream.end();
	}
	// Force exit if server close hangs.
	setTimeout(() => process.exit(0), 5000);
}

/**
 * Redirects process.stderr to both the original stderr and a persistent log file.
 */
function redirectStderrToFile(logPath: string): void {
	logStream = createWriteStream(logPath, { flags: "a" });
	const originalWrite = process.stderr.write.bind(process.stderr);

	function writeOverride(
		chunk: string | Uint8Array,
		encoding?: BufferEncoding | ((err?: Error | null) => void),
		callback?: (err?: Error | null) => void,
	): boolean {
		if (typeof encoding === "function") {
			callback = encoding;
			encoding = undefined;
		}
		logStream?.write(chunk, encoding as BufferEncoding);
		return originalWrite(chunk, encoding as BufferEncoding, callback);
	}

	process.stderr.write = writeOverride as typeof process.stderr.write;
}

async function main(): Promise<void> {
	const stateDir = getDaemonStateDir();
	await mkdir(stateDir, { recursive: true });

	const logPath = getDaemonLogPath();
	redirectStderrToFile(logPath);

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
		onStop: () => gracefulShutdown(),
		onActivity: () => {
			if (getExecutionCount() >= MAX_EXECUTIONS_BEFORE_RESTART) {
				restartPending = true;
			}
		},
		isRestartPending: () => restartPending,
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
		gracefulShutdown();
	});

	// Graceful shutdown on termination signals.
	process.on("SIGTERM", () => gracefulShutdown());
	process.on("SIGINT", () => gracefulShutdown());

	// Log uncaught exceptions and initiate graceful shutdown.
	process.on("uncaughtException", (err) => {
		console.error("Uncaught exception:", err);
		gracefulShutdown();
	});

	// Log unhandled rejections and initiate graceful shutdown.
	process.on("unhandledRejection", (reason) => {
		console.error("Unhandled rejection:", reason);
		gracefulShutdown();
	});
}

main().catch((err) => {
	console.error("Daemon failed to start:", err);
	process.exit(1);
});
