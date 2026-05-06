import type { DaemonState } from "./state.js";
import { sendRequest } from "./transport.js";

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
	ensureClient: () => Promise<DaemonClient>,
	invalidateCache?: () => void,
): DaemonClient {
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

				const shouldRetry = unreachable || code === "DAEMON_RESTARTING";

				if (shouldRetry) {
					invalidateCache?.();

					// For unreachable daemons, kill stale process and clear state
					// only if PID still matches. For DAEMON_RESTARTING the daemon
					// is already shutting down gracefully, so skip SIGTERM.
					if (unreachable) {
						const { readDaemonState, DAEMON_JSON } = await import("./state.js");
						const { unlink } = await import("node:fs/promises");
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
					}

					// Retry once with a fresh daemon
					const freshClient = await ensureClient();
					return await freshClient.run(commandPath, params);
				}

				throw err;
			}
		},
	};
}
