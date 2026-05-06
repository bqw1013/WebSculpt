import { open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type DaemonClient } from "./connection.js";
import { getDaemonStateDir } from "./daemon-paths.js";
import { startDaemonWithRetry, waitForDaemonReady } from "./spawn.js";
import { isProcessAlive, readDaemonState } from "./state.js";

let cachedClient: DaemonClient | null = null;

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
			cachedClient = createClient(state, ensureDaemonClient, () => {
				cachedClient = null;
			});
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
				cachedClient = createClient(state, ensureDaemonClient, () => {
					cachedClient = null;
				});
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

		cachedClient = createClient(state, ensureDaemonClient, () => {
			cachedClient = null;
		});
		return cachedClient;
	} finally {
		await release();
	}
}
