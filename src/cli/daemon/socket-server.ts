import { createServer, type Server, type Socket } from "node:net";
import { isBrowserConnected } from "./browser-manager.js";
import { executeCommand } from "./executor.js";
import { type SocketRequest, type SocketResponse, splitLines } from "./protocol.js";

export interface SocketServerOptions {
	onStop?: () => void;
	onActivity?: () => void;
}

let activeSessions = 0;
let executionCount = 0;
const MAX_CONCURRENT_SESSIONS = 20;

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

async function handleRequest(req: SocketRequest, options: SocketServerOptions): Promise<SocketResponse> {
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

			if (activeSessions >= MAX_CONCURRENT_SESSIONS) {
				return {
					id: requestId,
					error: { message: "Daemon is at capacity", code: "DAEMON_BUSY" },
				};
			}

			executionCount++;
			activeSessions++;
			try {
				const data = await executeCommand(commandPath, params);
				return { id: requestId, result: { success: true, data } };
			} catch (err) {
				const code = (err as Error & { code?: string }).code ?? "COMMAND_EXECUTION_ERROR";
				return { id: requestId, error: { message: (err as Error).message, code } };
			} finally {
				activeSessions--;
			}
		}

		case "health": {
			// Use isBrowserConnected to avoid triggering a lazy connection on health checks.
			const connected = isBrowserConnected();
			return { id: requestId, result: { connected, sessions: activeSessions } };
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

/**
 * Creates a net.Server that listens on the given local socket path
 * and communicates via newline-delimited JSON (NDJSON).
 */
export function createSocketServer(socketPath: string, options: SocketServerOptions = {}): Server {
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
				handleRequest(req, options)
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
					handleRequest(req, options)
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
