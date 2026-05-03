import { createConnection } from "node:net";
import { type SocketResponse, splitLines } from "../../daemon/protocol.js";

const REQUEST_TIMEOUT_MS = 60000;

/**
 * Sends a single JSON-RPC-style request to the daemon over its local socket.
 */
export function sendRequest(socketPath: string, method: string, params: Record<string, unknown>): Promise<unknown> {
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
