import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSocketPath } from "../../daemon/config/paths.js";
import { isProcessAlive, readDaemonState, writeDaemonState } from "./state.js";
import { sendRequest } from "./transport.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STARTUP_TIMEOUT_MS = 10000;
const HEALTH_TIMEOUT_MS = 5000;

/**
 * Resolves the daemon entrypoint depending on whether the CLI is running
 * from compiled dist (production) or source (development).
 */
export function resolveDaemonEntrypoint(): [string, ...string[]] {
	const distPath = join(__dirname, "..", "..", "..", "daemon", "index.js");
	if (existsSync(distPath)) {
		return [process.execPath, distPath];
	}

	// Development mode: use tsx to run TypeScript source.
	const tsxPath = require.resolve("tsx/cli");
	const srcPath = join(__dirname, "..", "..", "..", "..", "src", "cli", "daemon", "index.ts");
	return [process.execPath, tsxPath, srcPath];
}

/**
 * Builds a temporary VBScript that launches the daemon via WScript.Shell.Run.
 * On Windows this breaks the daemon away from the parent process's Job Object,
 * preventing the shell from waiting for the daemon to exit.
 */
function buildVbsLauncher(command: string, args: string[]): string {
	// Quote each argument for the command-line string.
	const parts = [command, ...args].map((arg) => `"${arg.replace(/"/g, '""')}"`);
	const cmdLine = parts.join(" ");
	// VBScript string literals use double quotes; internal quotes are doubled.
	const vbsString = `"${cmdLine.replace(/"/g, '""')}"`;
	return `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run ${vbsString}, 0, False\n`;
}

/**
 * Sends a lightweight health request to the daemon socket.
 */
async function healthCheck(socketPath: string): Promise<void> {
	await Promise.race([
		sendRequest(socketPath, "health", {}),
		new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Health check timeout")), HEALTH_TIMEOUT_MS)),
	]);
}

/**
 * Polls the daemon with health checks until it responds or a timeout is reached.
 * This replaces the previous stdout-pipe ready marker to avoid keeping the
 * parent's event loop alive on Windows.
 */
export async function waitForDaemonReady(socketPath: string): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < STARTUP_TIMEOUT_MS) {
		try {
			await healthCheck(socketPath);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 200));
		}
	}
	throw new Error("Daemon startup timeout: health check did not pass within 10s");
}

/**
 * Spawns the daemon process, waits for readiness, and persists its state.
 *
 * On Windows the daemon is launched via a temporary VBScript executed by
 * cscript. This uses the WScript.Shell COM object which creates a process
 * outside the parent's Job Object, avoiding the shell-level hang that occurs
 * with child_process.spawn on Windows.
 */
export async function startDaemon(): Promise<{ pid: number; socketPath: string }> {
	const [command, ...args] = resolveDaemonEntrypoint();
	const socketPath = getSocketPath();

	// On Unix, remove any stale socket file to avoid EADDRINUSE.
	if (process.platform !== "win32") {
		try {
			await unlink(socketPath);
		} catch {
			// Ignore if file does not exist.
		}
	}

	if (process.platform === "win32") {
		const vbsPath = join(tmpdir(), `websculpt-daemon-${Date.now()}.vbs`);
		const vbsContent = buildVbsLauncher(command, args);
		await writeFile(vbsPath, vbsContent, "utf-8");

		try {
			await new Promise<void>((resolve, reject) => {
				const launcher = spawn("cscript", ["//NoLogo", vbsPath], {
					windowsHide: true,
					stdio: "ignore",
				});
				launcher.on("exit", (code) => {
					if (code !== 0) {
						reject(new Error(`Daemon launcher exited with code ${code}`));
					} else {
						resolve();
					}
				});
				launcher.on("error", (err) => reject(err));
			});
		} finally {
			await unlink(vbsPath).catch(() => {});
		}

		// We don't know the PID yet; the daemon will write it itself.
		// Return a provisional state so the caller can re-read after health check.
		return { pid: -1, socketPath };
	}

	const child = spawn(command, args, {
		detached: true,
		stdio: "ignore",
	}) as ChildProcess;

	if (!child.pid) {
		throw new Error("Failed to spawn daemon process");
	}

	child.unref();

	const state: { pid: number; socketPath: string } = { pid: child.pid, socketPath };
	await writeDaemonState(state);
	return state;
}

/**
 * Attempts to start the daemon, and if a race condition caused it to fail
 * (e.g. EADDRINUSE on Windows named pipe), briefly waits and checks whether
 * another instance succeeded.
 */
export async function startDaemonWithRetry(): Promise<{ pid: number; socketPath: string }> {
	try {
		return await startDaemon();
	} catch (err) {
		const message = (err as Error).message ?? "";
		// If the daemon exited quickly or timed out, another process may have
		// raced to create the socket. Pause briefly and check for a new state file.
		if (message.includes("prematurely") || message.includes("timeout") || message.includes("EADDRINUSE")) {
			await new Promise((r) => setTimeout(r, 500));
			const state = await readDaemonState();
			if (state && isProcessAlive(state.pid)) {
				try {
					await healthCheck(state.socketPath);
					return state;
				} catch {
					// Fall through to throw the original error.
				}
			}
		}
		throw err;
	}
}
