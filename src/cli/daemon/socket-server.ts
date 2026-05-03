import { createServer, type Server, type Socket } from "node:net";
import { getOpenPageCount, isBrowserConnected, isBrowserLazy } from "./browser-manager.js";
import { executeCommand } from "./executor.js";
import { DAEMON_LIMITS } from "./limits.js";
import { logEvent } from "./logger.js";
import { recordExecutionEnd, recordExecutionStart } from "./metrics.js";
import { type SocketRequest, type SocketResponse, splitLines } from "./protocol.js";

export interface SocketServerOptions {
	onStop?: () => void;
	onActivity?: () => void;
	isRestartPending?: () => boolean;
	isDegraded?: () => boolean;
}

let activeSessions = 0;
let executionCount = 0;

/**
 * Returns the number of currently active command executions.
 */
export function getActiveSessions(): number {
	return activeSessions;
}

/**
 * Returns the total number of command executions since daemon startup.
 */
export function getExecutionCount(): number {
	return executionCount;
}

interface DrainState {
	initiated: boolean;
}

function scheduleShutdown(options: SocketServerOptions, drainState: DrainState): void {
	if (drainState.initiated) return;
	drainState.initiated = true;
	setImmediate(() => {
		options.onStop?.();
	});
}

async function handleRequest(
	req: SocketRequest,
	options: SocketServerOptions,
	drainState: DrainState,
): Promise<SocketResponse> {
	options.onActivity?.();

	const requestId = typeof req.id === "number" ? req.id : -1;

	switch (req.method) {
		case "run": {
			const commandPath = req.params?.commandPath as string | undefined;
			const params = (req.params?.params as Record<string, string>) ?? {};

			if (!commandPath || typeof commandPath !== "string") {
				return {
					id: requestId,
					error: { message: "Missing or invalid 'commandPath' in params", code: "INVALID_PARAMS" },
				};
			}

			if (options.isRestartPending?.()) {
				if (activeSessions === 0) {
					scheduleShutdown(options, drainState);
				}
				return {
					id: requestId,
					error: { message: "Daemon is restarting", code: "DAEMON_RESTARTING" },
				};
			}

			if (getOpenPageCount() >= DAEMON_LIMITS.maxTotalPages) {
				return {
					id: requestId,
					error: { message: "Daemon page limit reached", code: "DAEMON_PAGE_LIMIT" },
				};
			}

			if (activeSessions >= DAEMON_LIMITS.maxConcurrentSessions) {
				return {
					id: requestId,
					error: { message: "Daemon is at capacity", code: "DAEMON_BUSY" },
				};
			}

			const startTime = Date.now();
			logEvent("INFO", "req_start", { method: "run", commandPath });
			executionCount++;
			activeSessions++;
			recordExecutionStart(activeSessions);
			let executionSuccess = false;
			try {
				const data = await executeCommand(commandPath, params);
				executionSuccess = true;
				logEvent("INFO", "req_end", { method: "run", duration_ms: Date.now() - startTime, success: true });
				return { id: requestId, result: { success: true, data } };
			} catch (err) {
				const code = (err as Error & { code?: string }).code ?? "COMMAND_EXECUTION_ERROR";
				logEvent("ERROR", "req_error", { method: "run", error_code: code, error_message: (err as Error).message });
				logEvent("INFO", "req_end", { method: "run", duration_ms: Date.now() - startTime, success: false });
				return { id: requestId, error: { message: (err as Error).message, code } };
			} finally {
				activeSessions--;
				recordExecutionEnd(executionSuccess);
				if (options.isRestartPending?.() && activeSessions === 0) {
					scheduleShutdown(options, drainState);
				}
			}
		}

		case "health": {
			// Use isBrowserConnected to avoid triggering a lazy connection on health checks.
			const connected = isBrowserConnected();
			const lazy = isBrowserLazy();
			let pages = 0;
			if (connected) {
				try {
					pages = getOpenPageCount();
				} catch {
					pages = 0;
				}
			}
			const mem = process.memoryUsage();
			const uptime = Math.floor((Date.now() - startupTime) / 1000);

			return {
				id: requestId,
				result: {
					pid: process.pid,
					uptime,
					healthy: true,
					degraded: options.isDegraded?.() ?? false,
					browser: { connected, lazy, pages },
					sessions: { active: activeSessions, max: DAEMON_LIMITS.maxConcurrentSessions, total: executionCount },
					resources: {
						rssMB: Math.round(mem.rss / 1024 / 1024),
						heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
						heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
					},
					limits: { ...DAEMON_LIMITS },
				},
			};
		}

		case "stop": {
			// Schedule shutdown after returning the response so the client receives it.
			setImmediate(() => {
				options.onStop?.();
			});
			return { id: requestId, result: { shuttingDown: true } };
		}

		default:
			return {
				id: requestId,
				error: { message: `Unknown method: ${req.method}`, code: "UNKNOWN_METHOD" },
			};
	}
}

let startupTime = Date.now();

/**
 * Creates a net.Server that listens on the given local socket path
 * and communicates via newline-delimited JSON (NDJSON).
 */
export function createSocketServer(socketPath: string, options: SocketServerOptions = {}): Server {
	startupTime = Date.now();
	const drainState: DrainState = { initiated: false };
	const server = createServer((socket: Socket) => {
		let buffer = "";

		socket.setEncoding("utf-8");

		socket.on("data", (data: string) => {
			buffer += data;
			let lines: string[];
			[lines, buffer] = splitLines(buffer);

			for (const line of lines) {
				if (!line.trim()) continue;

				let req: SocketRequest;
				try {
					req = JSON.parse(line) as SocketRequest;
				} catch {
					const response: SocketResponse = {
						id: -1,
						error: { message: "Invalid JSON", code: "PARSE_ERROR" },
					};
					socket.write(`${JSON.stringify(response)}\n`);
					continue;
				}

				// Dispatch asynchronously to keep the socket responsive to further data.
				handleRequest(req, options, drainState)
					.then((response) => {
						socket.write(`${JSON.stringify(response)}\n`);
					})
					.catch((err: Error) => {
						const response: SocketResponse = {
							id: req.id,
							error: { message: err.message, code: "INTERNAL_ERROR" },
						};
						socket.write(`${JSON.stringify(response)}\n`);
					});
			}
		});

		socket.on("end", () => {
			// Process any remaining data that did not end with a newline.
			if (buffer.trim()) {
				try {
					const req = JSON.parse(buffer) as SocketRequest;
					handleRequest(req, options, drainState)
						.then((response) => socket.write(`${JSON.stringify(response)}\n`))
						.catch(() => {
							// Ignore errors during end-of-stream cleanup.
						});
				} catch {
					// Ignore trailing incomplete JSON.
				}
			}
			buffer = "";
		});

		socket.on("error", (err) => {
			// Socket errors are logged but not fatal to the daemon.
			console.error("Socket error:", err.message);
		});
	});

	server.listen(socketPath, () => {
		console.error(`Daemon listening on ${socketPath}`);
	});

	return server;
}
