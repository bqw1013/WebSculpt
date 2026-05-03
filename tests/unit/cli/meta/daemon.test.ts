import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async () => {
	const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
	return {
		...actual,
		unlink: vi.fn().mockResolvedValue(undefined),
	};
});

vi.mock("../../../../src/cli/engine/daemon/state.js", () => ({
	DAEMON_JSON: "/tmp/.websculpt/daemon.json",
	readDaemonState: vi.fn().mockResolvedValue(null),
	isProcessAlive: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../../src/cli/engine/daemon/transport.js", () => ({
	sendRequest: vi.fn().mockResolvedValue({ shuttingDown: true }),
}));

import { unlink } from "node:fs/promises";
import { isProcessAlive, readDaemonState } from "../../../../src/cli/engine/daemon/state.js";
import { sendRequest } from "../../../../src/cli/engine/daemon/transport.js";
import { handleDaemonStop } from "../../../../src/cli/meta/daemon.js";

describe("handleDaemonStop", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("reports not running and cleans up stale daemon.json when no daemon is active", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(isProcessAlive).mockReturnValueOnce(false);

		const result = await handleDaemonStop();

		expect(result).toEqual({ success: true, message: "Daemon was not running" });
		expect(unlink).toHaveBeenCalledWith("/tmp/.websculpt/daemon.json");
		expect(sendRequest).not.toHaveBeenCalled();
	});

	it("reports not running and cleans up when daemon.json is missing", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce(null);

		const result = await handleDaemonStop();

		expect(result).toEqual({ success: true, message: "Daemon was not running" });
		expect(unlink).toHaveBeenCalledWith("/tmp/.websculpt/daemon.json");
		expect(sendRequest).not.toHaveBeenCalled();
	});

	it("reports stopped when graceful shutdown succeeds within the poll window", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(isProcessAlive)
			.mockReturnValueOnce(true) // initial check
			.mockReturnValueOnce(false); // first poll

		const promise = handleDaemonStop();
		await vi.advanceTimersByTimeAsync(400);
		const result = await promise;

		expect(result).toEqual({ success: true, message: "Daemon stopped" });
		expect(sendRequest).toHaveBeenCalledWith("/tmp/daemon.sock", "stop", {});
		expect(unlink).toHaveBeenCalledWith("/tmp/.websculpt/daemon.json");
	});

	it("force-kills and reports killed forcefully when graceful stop times out", async () => {
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });

		let callCount = 0;
		vi.mocked(isProcessAlive).mockImplementation(() => {
			callCount++;
			// Simulate process dying after ~30 poll cycles (6s / 200ms = 30).
			return callCount <= 31;
		});

		const promise = handleDaemonStop();
		await vi.advanceTimersByTimeAsync(7000);
		const result = await promise;

		expect(result).toEqual({ success: true, message: "Daemon killed forcefully" });
		expect(killSpy).toHaveBeenCalledWith(1234, "SIGKILL");
		expect(unlink).toHaveBeenCalledWith("/tmp/.websculpt/daemon.json");

		killSpy.mockRestore();
	});

	it("reports stopped when the stop request fails but the daemon exits anyway", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(sendRequest).mockRejectedValueOnce(new Error("ECONNREFUSED"));
		vi.mocked(isProcessAlive)
			.mockReturnValueOnce(true) // initial check
			.mockReturnValueOnce(false); // first poll

		const promise = handleDaemonStop();
		await vi.advanceTimersByTimeAsync(400);
		const result = await promise;

		expect(result).toEqual({ success: true, message: "Daemon stopped" });
	});

	it("reports failure when SIGKILL does not terminate the process", async () => {
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		// Process survives everything.
		vi.mocked(isProcessAlive).mockReturnValue(true);

		const promise = handleDaemonStop();
		await vi.advanceTimersByTimeAsync(7000);
		const result = await promise;

		expect(result.success).toBe(false);
		expect("error" in result && result.error.message).toContain("Failed to stop daemon");

		killSpy.mockRestore();
	});
});
