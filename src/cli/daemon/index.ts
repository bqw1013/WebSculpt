import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { closeBrowser } from "./browser-manager.js";
import { getDaemonLogPath, getDaemonStateDir, getSocketPath } from "./paths.js";
import { createSocketServer } from "./socket-server.js";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let idleTimer: NodeJS.Timeout | null = null;
let server: ReturnType<typeof createSocketServer>;

function resetIdleTimer(): void {
	if (idleTimer) {
		clearTimeout(idleTimer);
	}
	idleTimer = setTimeout(() => {
		console.error("Idle timeout reached, shutting down.");
		gracefulShutdown();
	}, IDLE_TIMEOUT_MS);
}

function stopIdleTimer(): void {
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = null;
	}
}

async function gracefulShutdown(): Promise<void> {
	stopIdleTimer();
	await closeBrowser();
	server?.close(() => {
		process.exit(0);
	});
	// Force exit if server close hangs.
	setTimeout(() => process.exit(0), 5000);
}

/**
 * Redirects process.stderr to both the original stderr and a persistent log file.
 */
function redirectStderrToFile(logPath: string): void {
	const logStream = createWriteStream(logPath, { flags: "a" });
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
		logStream.write(chunk, encoding as BufferEncoding);
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
		onActivity: () => resetIdleTimer(),
	});

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			console.error("Socket already in use, another daemon instance is running. Exiting.");
			process.exit(0);
		}
		console.error("Server error:", err);
		gracefulShutdown();
	});

	resetIdleTimer();

	// Signal readiness to any parent process that spawned the daemon.
	process.stdout.write("WEBSCULPT_DAEMON_READY\n");

	// Graceful shutdown on termination signals.
	process.on("SIGTERM", () => gracefulShutdown());
	process.on("SIGINT", () => gracefulShutdown());

	// Log uncaught exceptions and initiate graceful shutdown.
	process.on("uncaughtException", (err) => {
		console.error("Uncaught exception:", err);
		gracefulShutdown();
	});
}

main().catch((err) => {
	console.error("Daemon failed to start:", err);
	process.exit(1);
});
