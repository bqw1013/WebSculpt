import { open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { getDaemonStateDir } from "../../daemon/paths.js";
import { startDaemonWithRetry, waitForDaemonReady } from "./spawn.js";
import { DAEMON_JSON, type DaemonState, isProcessAlive, readDaemonState } from "./state.js";
import { sendRequest } from "./transport.js";

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
 * Creates a DaemonClient backed by the given socket path.
 */
export function createClient(
	state: DaemonState,
	ensureClient?: () => Promise<DaemonClient>,
): DaemonClient {
	const { socketPath, pid: recordedPid } = state;
	const ensure = ensureClient ?? ensureDaemonClient;
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
					const freshClient = await ensure();
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
			await waitForDaemonReady(state.socketPath);
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
				await waitForDaemonReady(state.socketPath);
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
