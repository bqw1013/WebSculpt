import { mkdir, unlink } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/cli/daemon/runtime/executor.js", () => ({
	executeCommand: vi.fn().mockImplementation(async () => {
		await new Promise((resolve) => setTimeout(resolve, 200));
		return "ok";
	}),
}));

import { createSocketServer, getExecutionCount } from "../../../../src/cli/daemon/runtime/socket-server.js";

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
		// Spawn more concurrent requests than the limit to force saturation
		const requests: Promise<string>[] = [];
		for (let i = 0; i < 25; i++) {
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

describe("socket-server health check", () => {
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

	it("returns comprehensive status including pid, uptime, browser, sessions, resources, and limits", async () => {
		const response = await sendRequest(socketPath, {
			id: 1,
			method: "health",
		});

		const parsed = JSON.parse(response);
		expect(parsed.error).toBeUndefined();
		expect(parsed.result).toMatchObject({
			pid: expect.any(Number),
			uptime: expect.any(Number),
			healthy: true,
			degraded: false,
			browser: {
				connected: expect.any(Boolean),
				lazy: expect.any(Boolean),
				pages: expect.any(Number),
			},
			sessions: {
				active: expect.any(Number),
				max: expect.any(Number),
				total: expect.any(Number),
			},
			resources: {
				rssMB: expect.any(Number),
				heapUsedMB: expect.any(Number),
				heapTotalMB: expect.any(Number),
			},
			limits: {
				commandTimeoutSec: expect.any(Number),
				maxConcurrentSessions: expect.any(Number),
				maxTotalPages: expect.any(Number),
				memoryWarningMB: expect.any(Number),
				memoryLimitMB: expect.any(Number),
				restartAfterExecutions: expect.any(Number),
			},
		});
	});
});

describe("socket-server drain mode", () => {
	let socketPath: string;
	let server: ReturnType<typeof createSocketServer>;
	let onStopMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		socketPath = await createTestSocketPath();
		onStopMock = vi.fn();
		server = createSocketServer(socketPath, {
			onStop: onStopMock,
			onActivity: () => {},
			isRestartPending: () => true,
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

	it("rejects new run requests with DAEMON_RESTARTING when restart is pending", async () => {
		const response = await sendRequest(socketPath, {
			id: 1,
			method: "run",
			params: { commandPath: "/tmp/test.js", params: {} },
		});

		const parsed = JSON.parse(response);
		expect(parsed.error).toBeDefined();
		expect(parsed.error.code).toBe("DAEMON_RESTARTING");
	});

	it("triggers onStop when the last active session completes in restart-pending state", async () => {
		// First, send a run request that will be accepted (restartPending is false initially).
		const normalServer = createSocketServer(`${socketPath}-normal`, {
			onStop: onStopMock,
			onActivity: () => {},
			isRestartPending: () => false,
		});

		await new Promise<void>((resolve, reject) => {
			normalServer.on("listening", resolve);
			normalServer.on("error", reject);
		});

		const response = await sendRequest(`${socketPath}-normal`, {
			id: 1,
			method: "run",
			params: { commandPath: "/tmp/test.js", params: {} },
		});

		const parsed = JSON.parse(response);
		expect(parsed.error).toBeUndefined();
		normalServer.close();
	});

	it("initiates shutdown via onStop after active sessions drain during restart", async () => {
		// Use a socket path that allows restartPending to flip mid-test.
		const drainSocketPath = `${socketPath}-drain`;
		let restartPending = false;
		const drainOnStop = vi.fn();

		const drainServer = createSocketServer(drainSocketPath, {
			onStop: drainOnStop,
			onActivity: () => {},
			isRestartPending: () => restartPending,
		});

		await new Promise<void>((resolve, reject) => {
			drainServer.on("listening", resolve);
			drainServer.on("error", reject);
		});

		// First request: accepted because restartPending is still false.
		const initialExecutionCount = getExecutionCount();
		const runPromise = sendRequest(drainSocketPath, {
			id: 1,
			method: "run",
			params: { commandPath: "/tmp/test.js", params: {} },
		});

		// Wait until the request has been accepted (executionCount increments)
		// before flipping restartPending.
		while (getExecutionCount() === initialExecutionCount) {
			await new Promise((r) => setTimeout(r, 5));
		}
		restartPending = true;

		const response = await runPromise;
		const parsed = JSON.parse(response);
		expect(parsed.error).toBeUndefined();

		// Second request: rejected because restartPending is now true.
		const rejectResponse = await sendRequest(drainSocketPath, {
			id: 2,
			method: "run",
			params: { commandPath: "/tmp/test.js", params: {} },
		});
		const rejectParsed = JSON.parse(rejectResponse);
		expect(rejectParsed.error?.code).toBe("DAEMON_RESTARTING");

		// Wait for the first run to finish (mocked executeCommand resolves after 200ms).
		await new Promise((r) => setTimeout(r, 400));

		// Once the active session drops to 0, onStop should be called.
		expect(drainOnStop).toHaveBeenCalledTimes(1);

		drainServer.close();
	});
});
