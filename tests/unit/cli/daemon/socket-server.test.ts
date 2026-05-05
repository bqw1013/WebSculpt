import { mkdir, unlink } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/cli/daemon/runtime/executor.js", () => ({
	executeCommand: vi.fn().mockResolvedValue("ok"),
}));

vi.mock("../../../../src/cli/daemon/observability/logger.js", () => ({
	initLogger: vi.fn(),
	logEvent: vi.fn(),
	closeLogger: vi.fn(),
}));

vi.mock("../../../../src/cli/daemon/observability/metrics.js", () => ({
	recordExecutionStart: vi.fn(),
	recordExecutionEnd: vi.fn(),
	recordPeakPages: vi.fn(),
	recordPeakRss: vi.fn(),
	flushMetrics: vi.fn().mockResolvedValue(undefined),
}));

let mockPageCount = 0;

vi.mock("../../../../src/cli/daemon/runtime/browser-manager.js", async () => {
	const actual = await vi.importActual<typeof import("../../../../src/cli/daemon/runtime/browser-manager.js")>(
		"../../../../src/cli/daemon/runtime/browser-manager.js",
	);
	return {
		...actual,
		getOpenPageCount: vi.fn().mockImplementation(() => mockPageCount),
		isBrowserConnected: vi.fn().mockReturnValue(false),
		isBrowserLazy: vi.fn().mockReturnValue(true),
	};
});

import { createSocketServer } from "../../../../src/cli/daemon/runtime/socket-server.js";

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

describe("socket-server page limit", () => {
	let socketPath: string;
	let server: ReturnType<typeof createSocketServer>;

	beforeEach(async () => {
		mockPageCount = 0;
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

	it("rejects run requests with DAEMON_PAGE_LIMIT when page count is at the limit", async () => {
		mockPageCount = 50;

		const response = await sendRequest(socketPath, {
			id: 1,
			method: "run",
			params: { commandPath: "/tmp/test.js", params: {} },
		});

		const parsed = JSON.parse(response);
		expect(parsed.error).toBeDefined();
		expect(parsed.error.code).toBe("DAEMON_PAGE_LIMIT");
	});

	it("accepts run requests when page count is below the limit", async () => {
		mockPageCount = 49;

		const response = await sendRequest(socketPath, {
			id: 1,
			method: "run",
			params: { commandPath: "/tmp/test.js", params: {} },
		});

		const parsed = JSON.parse(response);
		expect(parsed.error).toBeUndefined();
		expect(parsed.result).toBeDefined();
	});
});
