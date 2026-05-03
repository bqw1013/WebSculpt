import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDaemonStateDir, getSocketPath } from "../daemon/paths.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DAEMON_JSON = join(getDaemonStateDir(), "daemon.json");
const STARTUP_TIMEOUT_MS = 10000;
const HEALTH_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 60000;

interface DaemonState {
	pid: number;
	socketPath: string;
}

interface SocketResponse {
	id: number;
	result?: unknown;
	error?: { message: string; code: string };
}

let cachedClient: DaemonClient | null = null;

/**
 * Client for communicating with the websculpt-daemon process over a local socket.
 */
export interface DaemonClient {
	/**
	 * Sends a run request to the daemon to execute the command module at the given path.
	 */
	run(commandPath: string, params: Record<string, string>): Promise<unknown>;
}

/**
 * Reads the persisted daemon state from disk.
 */
async function readDaemonState(): Promise<DaemonState | null> {
	try {
		const text = await readFile(DAEMON_JSON, "utf-8");
		return JSON.parse(text) as DaemonState;
	} catch {
		return null;
	}
}

/**
 * Writes the daemon state to disk for discovery by future CLI invocations.
 */
async function writeDaemonState(state: DaemonState): Promise<void> {
	await mkdir(getDaemonStateDir(), { recursive: true });
	await writeFile(DAEMON_JSON, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Checks whether a process with the given PID is alive.
 * Non-positive PIDs are treated as invalid (used for provisional states).
 */
function isProcessAlive(pid: number): boolean {
	if (pid <= 0) {
		return false;
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Resolves the daemon entrypoint depending on whether the CLI is running
 * from compiled dist (production) or source (development).
 */
function resolveDaemonEntrypoint(): [string, ...string[]] {
	const distPath = join(__dirname, "..", "daemon", "index.js");
	if (existsSync(distPath)) {
		return [process.execPath, distPath];
	}

	// Development mode: use tsx to run TypeScript source.
	const tsxPath = require.resolve("tsx/dist/cli.mjs");
	const srcPath = join(__dirname, "..", "..", "..", "src", "cli", "daemon", "index.ts");
	return [process.execPath, tsxPath, srcPath];
}

/**
 * Polls the daemon with health checks until it responds or a timeout is reached.
 * This replaces the previous stdout-pipe ready marker to avoid keeping the
 * parent's event loop alive on Windows.
 */
async function waitForDaemonReady(socketPath: string): Promise<void> {
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
 * Sends a lightweight health request to the daemon socket.
 */
async function healthCheck(socketPath: string): Promise<void> {
	await Promise.race([
		sendRequest(socketPath, "health", {}),
		new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Health check timeout")), HEALTH_TIMEOUT_MS)),
	]);
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
 * Spawns the daemon process, waits for readiness, and persists its state.
 *
 * On Windows the daemon is launched via a temporary VBScript executed by
 * cscript. This uses the WScript.Shell COM object which creates a process
 * outside the parent's Job Object, avoiding the shell-level hang that occurs
 * with child_process.spawn on Windows.
 */
async function startDaemon(): Promise<DaemonState> {
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

	const state: DaemonState = { pid: child.pid, socketPath };
	await writeDaemonState(state);
	return state;
}

/**
 * Attempts to start the daemon, and if a race condition caused it to fail
 * (e.g. EADDRINUSE on Windows named pipe), briefly waits and checks whether
 * another instance succeeded.
 */
async function startDaemonWithRetry(): Promise<DaemonState> {
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

/**
 * Sends a single JSON-RPC-style request to the daemon over its local socket.
 */
function sendRequest(socketPath: string, method: string, params: Record<string, unknown>): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const socket = createConnection(socketPath);
		let buffer = "";
		let settled = false;

		const timeout = setTimeout(() => {
			if (!settled) {
				settled = true;
				socket.destroy();
				const error = new Error("Socket request timed out");
				(error as Error & { code: string }).code = "SOCKET_TIMEOUT";
				reject(error);
			}
		}, REQUEST_TIMEOUT_MS);

		socket.setEncoding("utf-8");

		socket.on("connect", () => {
			const request = { id: 1, method, params };
			socket.write(`${JSON.stringify(request)}\n`);
		});

		socket.on("data", (data: string) => {
			buffer += data;
			let lines: string[];
			[lines, buffer] = splitLines(buffer);

			for (const line of lines) {
				if (!line.trim() || settled) continue;
				try {
					const response = JSON.parse(line) as SocketResponse;
					settled = true;
					clearTimeout(timeout);
					socket.destroy();

					if (response.error) {
						const error = new Error(String(response.error.message));
						(error as Error & { code: string }).code = response.error.code;
						reject(error);
					} else {
						resolve(response.result);
					}
					return;
				} catch {
					// Ignore non-JSON lines.
				}
			}
		});

		socket.on("error", (err) => {
			if (!settled) {
				settled = true;
				clearTimeout(timeout);
				reject(err);
			}
		});

		socket.on("close", () => {
			if (!settled) {
				settled = true;
				clearTimeout(timeout);
				reject(new Error("Socket closed before response received"));
			}
		});
	});
}

/**
 * Splits a buffer into complete lines and returns the remainder.
 */
function splitLines(buffer: string): [string[], string] {
	const lines = buffer.split("\n");
	const remainder = lines.pop() ?? "";
	return [lines, remainder];
}

/**
 * Creates a DaemonClient backed by the given socket path.
 */
export function createClient(state: DaemonState): DaemonClient {
	const { socketPath, pid: recordedPid } = state;
	return {
		async run(commandPath: string, params: Record<string, string>): Promise<unknown> {
			try {
				const result = await sendRequest(socketPath, "run", { commandPath, params });
				// The daemon wraps successful results as { success: true, data: ... }
				if (result && typeof result === "object" && "success" in result) {
					return (result as { success: boolean; data: unknown }).data;
				}
				return result;
			} catch (err) {
				const message = (err as Error).message ?? "";
				const code = (err as Error & { code?: string }).code;

				// Detect unreachable daemon (connection refused, stale pipe, etc.)
				const unreachable =
					code === "DAEMON_UNREACHABLE" ||
					message.includes("ECONNREFUSED") ||
					message.includes("ENOENT") ||
					message.includes("EADDRINUSE");

				if (unreachable) {
					cachedClient = null;

					// Kill stale daemon and clear state only if PID still matches
					const currentState = await readDaemonState();
					if (currentState) {
						if (currentState.pid === recordedPid) {
							try {
								process.kill(currentState.pid, "SIGTERM");
							} catch {
								// Ignore if process already gone
							}
							await unlink(DAEMON_JSON).catch(() => {});
						}
						// If PID does not match, another process restarted the daemon.
						// Do not kill the healthy daemon and do not clear daemon.json.
					}

					// Retry once with a fresh daemon
					const freshClient = await ensureDaemonClient();
					return await freshClient.run(commandPath, params);
				}

				throw err;
			}
		},
	};
}

/**
 * Acquires a cross-process lock using an exclusive file creation.
 * Only one process can hold this lock at a time.
 */
async function acquireDaemonLock(): Promise<() => Promise<void>> {
	const lockFile = join(getDaemonStateDir(), "daemon-start.lock");
	while (true) {
		try {
			const handle = await open(lockFile, "wx");
			return async () => {
				await handle.close();
				await unlink(lockFile).catch(() => {});
			};
		} catch {
			// Lock file exists; another process is starting the daemon.
			await new Promise((r) => setTimeout(r, 100));
		}
	}
}

/**
 * Returns a healthy DaemonClient, spawning a new daemon if necessary.
 */
export async function ensureDaemonClient(): Promise<DaemonClient> {
	if (cachedClient) {
		return cachedClient;
	}

	let state = await readDaemonState();

	// Validate existing daemon via PID and health check
	if (state && isProcessAlive(state.pid)) {
		try {
			await healthCheck(state.socketPath);
			cachedClient = createClient(state);
			return cachedClient;
		} catch {
			// Stale daemon; fall through to start a new one
		}
	}

	// Acquire cross-process lock to prevent multiple CLI processes
	// from spawning daemons simultaneously.
	const release = await acquireDaemonLock();
	try {
		// Re-check after acquiring lock: another process may have
		// started the daemon while we were waiting.
		state = await readDaemonState();
		if (state && isProcessAlive(state.pid)) {
			try {
				await healthCheck(state.socketPath);
				cachedClient = createClient(state);
				return cachedClient;
			} catch {
				// Stale daemon; fall through to start a new one
			}
		}

		// Start a new daemon process
		try {
			state = await startDaemonWithRetry();
		} catch (err) {
			const error = new Error(`Failed to start daemon: ${(err as Error).message}`);
			(error as Error & { code: string }).code = "DAEMON_START_FAILED";
			throw error;
		}

		// Verify the newly started daemon is reachable.
		// Use polling with a startup timeout since the daemon no longer signals
		// readiness via stdout (stdio is "ignore" to prevent pipe handles from
		// keeping the parent process alive on Windows).
		try {
			await waitForDaemonReady(state.socketPath);
		} catch (err) {
			const error = new Error(`Daemon started but is unreachable: ${(err as Error).message}`);
			(error as Error & { code: string }).code = "DAEMON_UNREACHABLE";
			throw error;
		}

		// On Windows the daemon writes its own PID file asynchronously.
		// Ensure the real PID is persisted before releasing the lock so
		// subsequent CLI processes can discover the daemon correctly and
		// so the client's stale-daemon cleanup logic uses the real PID.
		if (state.pid <= 0) {
			const pollStart = Date.now();
			while (Date.now() - pollStart < 5000) {
				const fresh = await readDaemonState();
				if (fresh && fresh.pid > 0 && isProcessAlive(fresh.pid)) {
					state = fresh;
					break;
				}
				await new Promise((r) => setTimeout(r, 50));
			}
		}

		if (state.pid <= 0) {
			const error = new Error("Daemon started but did not write its state file");
			(error as Error & { code: string }).code = "DAEMON_UNREACHABLE";
			throw error;
		}

		cachedClient = createClient(state);
		return cachedClient;
	} finally {
		await release();
	}
}
