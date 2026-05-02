import { mkdir, unlink } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/cli/daemon/executor.js", () => ({
	executeCommand: vi.fn().mockImplementation(async () => {
		await new Promise((resolve) => setTimeout(resolve, 200));
		return "ok";
	}),
}));

import { createSocketServer, getExecutionCount } from "../../../../src/cli/daemon/socket-server.js";

async function createTestSocketPath(): Promise<string> {
	if (process.platform === "win32") {
		return `\\\\.\\pipe\\websculpt-test-${Date.now()}`;
	}
	const dir = join(tmpdir(), `websculpt-test-${Date.now()}`);
	await mkdir(dir, { recursive: true });
	return join(dir, "test.sock");
}

function sendRequest(socketPath: string, request: unknown): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = createConnection(socketPath);
		let buffer = "";

		socket.setEncoding("utf-8");

		socket.on("connect", () => {
			socket.write(`${JSON.stringify(request)}\n`);
		});

		socket.on("data", (data: string) => {
			buffer += data;
			if (buffer.includes("\n")) {
				socket.destroy();
				resolve(buffer.trim());
			}
		});

		socket.on("error", reject);
		socket.on("close", () => {
			if (!buffer.includes("\n")) {
				resolve(buffer.trim());
			}
		});
	});
}

describe("socket-server execution limits", () => {
	let socketPath: string;
	let server: ReturnType<typeof createSocketServer>;

	beforeEach(async () => {
		socketPath = await createTestSocketPath();
		server = createSocketServer(socketPath, {
			onStop: () => {},
			onActivity: () => {},
		});

		await new Promise<void>((resolve, reject) => {
			server.on("listening", resolve);
			server.on("error", reject);
		});
	});

	afterEach(async () => {
		server?.close();
		if (process.platform !== "win32") {
			try {
				await unlink(socketPath);
			} catch {
				// ignore
			}
		}
	});

	it("increments execution count on each run request", async () => {
		const initialCount = getExecutionCount();

		const response = await sendRequest(socketPath, {
			id: 1,
			method: "run",
			params: { commandPath: "/tmp/test.js", params: {} },
		});

		const parsed = JSON.parse(response);
		expect(parsed.error).toBeUndefined();
		expect(getExecutionCount()).toBe(initialCount + 1);
	});

	it("rejects requests with DAEMON_BUSY when concurrent limit is reached", async () => {
		// Spawn many concurrent requests
		const requests: Promise<string>[] = [];
		for (let i = 0; i < 15; i++) {
			requests.push(
				sendRequest(socketPath, {
					id: i + 1,
					method: "run",
					params: { commandPath: "/tmp/test.js", params: {} },
				}),
			);
		}

		const responses = await Promise.all(requests);
		const parsedResponses = responses.map((r) => JSON.parse(r));
		const busyResponses = parsedResponses.filter((r) => r.error?.code === "DAEMON_BUSY");

		expect(busyResponses.length).toBeGreaterThan(0);
	});
});
