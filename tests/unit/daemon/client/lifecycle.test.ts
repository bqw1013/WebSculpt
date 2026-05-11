import { beforeEach, describe, expect, it, vi } from "vitest";

const mockKillDaemonProcess = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockWaitForDaemonReady = vi.hoisted(() => vi.fn());
const mockStartDaemonWithRetry = vi.hoisted(() => vi.fn());
const mockReadDaemonState = vi.hoisted(() => vi.fn());
const mockIsProcessAlive = vi.hoisted(() => vi.fn());
const mockCreateClient = vi.hoisted(() => vi.fn());

vi.mock("../../../../src/daemon/client/kill-process.js", () => ({
	killDaemonProcess: mockKillDaemonProcess,
}));

vi.mock("../../../../src/daemon/client/spawn.js", () => ({
	waitForDaemonReady: mockWaitForDaemonReady,
	startDaemonWithRetry: mockStartDaemonWithRetry,
}));

vi.mock("../../../../src/daemon/client/state.js", () => ({
	readDaemonState: mockReadDaemonState,
	isProcessAlive: mockIsProcessAlive,
	DAEMON_JSON: "/tmp/daemon.json",
}));

vi.mock("../../../../src/daemon/client/connection.js", () => ({
	createClient: mockCreateClient,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		open: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) }),
		unlink: vi.fn().mockResolvedValue(undefined),
	};
});

describe("ensureDaemonClient", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockKillDaemonProcess.mockResolvedValue(undefined);
		mockCreateClient.mockReturnValue({ run: vi.fn() });
		mockWaitForDaemonReady.mockResolvedValue(undefined);
		mockStartDaemonWithRetry.mockResolvedValue({ pid: 9999, socketPath: "/tmp/default.sock" });
		mockReadDaemonState.mockResolvedValue(null);
		mockIsProcessAlive.mockReturnValue(false);
	});

	it("kills stale daemon before starting a new one (pre-lock health check failure)", async () => {
		const staleState = { pid: 1234, socketPath: "/tmp/test.sock" };
		const freshState = { pid: 5678, socketPath: "/tmp/test.sock" };

		mockReadDaemonState.mockResolvedValue(staleState);
		mockIsProcessAlive.mockReturnValue(true);
		mockWaitForDaemonReady
			.mockRejectedValueOnce(new Error("health check failed"))
			.mockRejectedValueOnce(new Error("health check failed"));
		mockStartDaemonWithRetry.mockResolvedValue(freshState);

		const { ensureDaemonClient } = await import("../../../../src/daemon/client/lifecycle.js");
		await ensureDaemonClient();

		expect(mockKillDaemonProcess).toHaveBeenCalledTimes(2);
		expect(mockKillDaemonProcess).toHaveBeenNthCalledWith(1, 1234);
		expect(mockKillDaemonProcess).toHaveBeenNthCalledWith(2, 1234);
		expect(mockStartDaemonWithRetry).toHaveBeenCalled();
	});

	it("kills stale daemon before starting a new one (post-lock health check failure)", async () => {
		const staleState = { pid: 1234, socketPath: "/tmp/test.sock" };
		const freshState = { pid: 5678, socketPath: "/tmp/test.sock" };

		// First read (pre-lock) returns null so we fall through to acquire lock.
		mockReadDaemonState.mockResolvedValueOnce(null).mockResolvedValueOnce(staleState);
		mockIsProcessAlive.mockReturnValue(true);
		mockWaitForDaemonReady.mockRejectedValueOnce(new Error("health check failed"));
		mockStartDaemonWithRetry.mockResolvedValue(freshState);

		const { ensureDaemonClient } = await import("../../../../src/daemon/client/lifecycle.js");
		await ensureDaemonClient();

		expect(mockKillDaemonProcess).toHaveBeenCalledTimes(1);
		expect(mockKillDaemonProcess).toHaveBeenCalledWith(1234);
		expect(mockStartDaemonWithRetry).toHaveBeenCalled();
	});

	it("does not kill when health check passes", async () => {
		const state = { pid: 1234, socketPath: "/tmp/test.sock" };

		mockReadDaemonState.mockResolvedValue(state);
		mockIsProcessAlive.mockReturnValue(true);
		mockWaitForDaemonReady.mockResolvedValue(undefined);

		const { ensureDaemonClient } = await import("../../../../src/daemon/client/lifecycle.js");
		await ensureDaemonClient();

		expect(mockKillDaemonProcess).not.toHaveBeenCalled();
		expect(mockStartDaemonWithRetry).not.toHaveBeenCalled();
	});

	it("does not kill when no daemon state exists", async () => {
		mockReadDaemonState.mockResolvedValue(null);
		mockStartDaemonWithRetry.mockResolvedValue({ pid: 5678, socketPath: "/tmp/test.sock" });

		const { ensureDaemonClient } = await import("../../../../src/daemon/client/lifecycle.js");
		await ensureDaemonClient();

		expect(mockKillDaemonProcess).not.toHaveBeenCalled();
		expect(mockStartDaemonWithRetry).toHaveBeenCalled();
	});

	it("does not kill when PID is not alive", async () => {
		const state = { pid: 1234, socketPath: "/tmp/test.sock" };

		mockReadDaemonState.mockResolvedValue(state);
		mockIsProcessAlive.mockReturnValue(false);
		mockStartDaemonWithRetry.mockResolvedValue({ pid: 5678, socketPath: "/tmp/test.sock" });

		const { ensureDaemonClient } = await import("../../../../src/daemon/client/lifecycle.js");
		await ensureDaemonClient();

		expect(mockKillDaemonProcess).not.toHaveBeenCalled();
		expect(mockStartDaemonWithRetry).toHaveBeenCalled();
	});
});
