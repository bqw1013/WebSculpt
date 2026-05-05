import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async () => {
	const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
	return {
		...actual,
		unlink: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn().mockResolvedValue(""),
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

vi.mock("../../../../src/cli/daemon/config/paths.js", () => ({
	getDaemonLogPath: vi.fn().mockReturnValue("/tmp/.websculpt/daemon.log"),
}));

vi.mock("../../../../src/cli/engine/daemon/client.js", () => ({
	ensureDaemonClient: vi.fn().mockResolvedValue(undefined),
}));

import { readFile, unlink } from "node:fs/promises";
import { getDaemonLogPath } from "../../../../src/cli/daemon/config/paths.js";
import { ensureDaemonClient } from "../../../../src/cli/engine/daemon/client.js";
import { isProcessAlive, readDaemonState } from "../../../../src/cli/engine/daemon/state.js";
import { sendRequest } from "../../../../src/cli/engine/daemon/transport.js";
import {
	handleDaemonLogs,
	handleDaemonRestart,
	handleDaemonStart,
	handleDaemonStatus,
	handleDaemonStop,
} from "../../../../src/cli/meta/daemon.js";

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
			// Keep alive through initial check + graceful polling (10000ms / 200ms = 50),
			// then die during the first SIGKILL confirmation poll.
			return callCount <= 51;
		});

		const promise = handleDaemonStop();
		await vi.advanceTimersByTimeAsync(11000);
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
		await vi.advanceTimersByTimeAsync(14000);
		const result = await promise;

		expect(result.success).toBe(false);
		expect("error" in result && result.error.message).toContain("Failed to stop daemon");

		killSpy.mockRestore();
	});
});

describe("handleDaemonStatus", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns error when daemon is not running", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce(null);

		const result = await handleDaemonStatus();

		expect(result).toEqual({
			success: false,
			error: { code: "DAEMON_NOT_RUNNING", message: "Daemon is not running" },
		});
	});

	it("returns error when daemon process is dead", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(isProcessAlive).mockReturnValueOnce(false);

		const result = await handleDaemonStatus();

		expect(result).toEqual({
			success: false,
			error: { code: "DAEMON_NOT_RUNNING", message: "Daemon is not running" },
		});
	});

	it("returns status when daemon is running and healthy", async () => {
		const mockStatus = {
			pid: 1234,
			uptime: 120,
			healthy: true,
			degraded: false,
			browser: { connected: true, lazy: false, pages: 2 },
			sessions: { active: 1, max: 20, total: 5 },
			resources: { rssMB: 100, heapUsedMB: 30, heapTotalMB: 50 },
			limits: {
				commandTimeoutSec: 1200,
				maxConcurrentSessions: 20,
				maxTotalPages: 50,
				memoryWarningMB: 400,
				memoryLimitMB: 600,
				memoryEmergencyMB: 1000,
				restartAfterExecutions: 200,
			},
		};
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(isProcessAlive).mockReturnValueOnce(true);
		vi.mocked(sendRequest).mockResolvedValueOnce(mockStatus);

		const result = await handleDaemonStatus();

		expect(result).toEqual({ success: true, status: mockStatus });
		expect(sendRequest).toHaveBeenCalledWith("/tmp/daemon.sock", "health", {});
	});

	it("returns error when daemon is unreachable", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(isProcessAlive).mockReturnValueOnce(true);
		vi.mocked(sendRequest).mockRejectedValueOnce(new Error("ECONNREFUSED"));

		const result = await handleDaemonStatus();

		expect(result.success).toBe(false);
		expect("error" in result && result.error.code).toBe("DAEMON_UNREACHABLE");
	});
});

describe("handleDaemonLogs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the last 50 lines by default", async () => {
		const lines = Array.from({ length: 60 }, (_, i) => JSON.stringify({ line: i + 1 }));
		vi.mocked(readFile).mockResolvedValueOnce(lines.join("\n"));

		const result = await handleDaemonLogs();

		expect(result.success).toBe(true);
		expect("lines" in result && result.lines.length).toBe(50);
		expect("lines" in result && result.lines[0]).toContain("11");
	});

	it("returns a custom number of lines with --lines option", async () => {
		const lines = Array.from({ length: 60 }, (_, i) => JSON.stringify({ line: i + 1 }));
		vi.mocked(readFile).mockResolvedValueOnce(lines.join("\n"));

		const result = await handleDaemonLogs({ lines: 10 });

		expect(result.success).toBe(true);
		expect("lines" in result && result.lines.length).toBe(10);
	});

	it("returns error when log file is missing", async () => {
		vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));

		const result = await handleDaemonLogs();

		expect(result).toEqual({
			success: false,
			error: { code: "NO_LOGS_AVAILABLE", message: "No daemon logs are available" },
		});
	});

	it("reads from the daemon log path", async () => {
		vi.mocked(readFile).mockResolvedValueOnce('{"event":"start"}\n');

		await handleDaemonLogs();

		expect(getDaemonLogPath).toHaveBeenCalled();
		expect(readFile).toHaveBeenCalledWith("/tmp/.websculpt/daemon.log", "utf-8");
	});
});

describe("handleDaemonStart", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns already running when daemon is healthy", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(isProcessAlive).mockReturnValueOnce(true);
		vi.mocked(sendRequest).mockResolvedValueOnce({});

		const result = await handleDaemonStart();

		expect(result).toEqual({ success: true, message: "Daemon already running" });
		expect(ensureDaemonClient).not.toHaveBeenCalled();
	});

	it("starts the daemon when no daemon is running", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce(null);

		const result = await handleDaemonStart();

		expect(result).toEqual({ success: true, message: "Daemon started" });
		expect(ensureDaemonClient).toHaveBeenCalled();
	});

	it("starts the daemon when existing daemon is unreachable", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(isProcessAlive).mockReturnValueOnce(true);
		vi.mocked(sendRequest).mockRejectedValueOnce(new Error("ECONNREFUSED"));

		const result = await handleDaemonStart();

		expect(result).toEqual({ success: true, message: "Daemon started" });
		expect(ensureDaemonClient).toHaveBeenCalled();
	});

	it("returns error when ensureDaemonClient fails", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce(null);
		vi.mocked(ensureDaemonClient).mockRejectedValueOnce(new Error("spawn failed"));

		const result = await handleDaemonStart();

		expect(result.success).toBe(false);
		expect("error" in result && result.error.code).toBe("DAEMON_START_FAILED");
	});
});

describe("handleDaemonRestart", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns restarted when stop and start both succeed", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(isProcessAlive).mockReturnValue(false);

		const result = await handleDaemonRestart();

		expect(result).toEqual({ success: true, message: "Daemon restarted" });
		expect(ensureDaemonClient).toHaveBeenCalled();
	});

	it("returns stop error when stop fails", async () => {
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(isProcessAlive).mockReturnValue(true);

		const promise = handleDaemonRestart();
		await vi.advanceTimersByTimeAsync(14000);
		const result = await promise;

		expect(result.success).toBe(false);
		expect("error" in result && result.error.code).toBe("DAEMON_STOP_FAILED");
		expect(ensureDaemonClient).not.toHaveBeenCalled();

		killSpy.mockRestore();
	});

	it("returns start error when stop succeeds but start fails", async () => {
		vi.mocked(readDaemonState).mockResolvedValueOnce({ pid: 1234, socketPath: "/tmp/daemon.sock" });
		vi.mocked(isProcessAlive).mockReturnValue(false);
		vi.mocked(ensureDaemonClient).mockRejectedValueOnce(new Error("spawn failed"));

		const result = await handleDaemonRestart();

		expect(result.success).toBe(false);
		expect("error" in result && result.error.code).toBe("DAEMON_START_FAILED");
	});
});
