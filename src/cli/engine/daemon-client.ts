import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
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
 */
function isProcessAlive(pid: number): boolean {
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
 * Waits for the daemon process to print the readiness marker on stdout.
 */
function waitForReadyMarker(child: ChildProcess): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error("Daemon startup timeout: ready marker not received within 10s"));
		}, STARTUP_TIMEOUT_MS);

		const onData = (data: Buffer) => {
			const text = data.toString();
			if (text.includes("WEBSCULPT_DAEMON_READY")) {
				clearTimeout(timeout);
				cleanup();
				resolve();
			}
		};

		const onError = (err: Error) => {
			clearTimeout(timeout);
			cleanup();
			reject(err);
		};

		const onExit = (code: number | null) => {
			clearTimeout(timeout);
			cleanup();
			reject(new Error(`Daemon exited prematurely with code ${code ?? "unknown"}`));
		};

		const cleanup = () => {
			child.stdout?.off("data", onData);
			child.off("error", onError);
			child.off("exit", onExit);
		};

		child.stdout?.on("data", onData);
		child.on("error", onError);
		child.on("exit", onExit);
	});
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
 * Spawns the daemon process, waits for readiness, and persists its state.
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

	const child = spawn(command, args, {
		detached: true,
		stdio: ["ignore", "pipe", "pipe"],
	}) as ChildProcess;

	if (!child.pid) {
		throw new Error("Failed to spawn daemon process");
	}

	await waitForReadyMarker(child);

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
				reject(new Error("Socket request timed out"));
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
function createClient(socketPath: string): DaemonClient {
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

					// Kill stale daemon and clear state
					const state = await readDaemonState();
					if (state) {
						try {
							process.kill(state.pid, "SIGTERM");
						} catch {
							// Ignore if process already gone
						}
						await unlink(DAEMON_JSON).catch(() => {});
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
			cachedClient = createClient(state.socketPath);
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

	// Verify the newly started daemon is reachable
	try {
		await healthCheck(state.socketPath);
	} catch (err) {
		const error = new Error(`Daemon started but is unreachable: ${(err as Error).message}`);
		(error as Error & { code: string }).code = "DAEMON_UNREACHABLE";
		throw error;
	}

	cachedClient = createClient(state.socketPath);
	return cachedClient;
}
