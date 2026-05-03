import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => {
	const mockWrite = vi.fn().mockReturnValue(true);
	const mockEnd = vi.fn();
	return {
		createWriteStream: vi.fn().mockReturnValue({
			write: mockWrite,
			end: mockEnd,
		}),
	};
});

vi.mock("../../../../src/cli/daemon/paths.js", () => ({
	getDaemonLogPath: vi.fn().mockReturnValue("/tmp/.websculpt/daemon.log"),
}));

import { createWriteStream } from "node:fs";
import { closeLogger, initLogger, logEvent } from "../../../../src/cli/daemon/logger.js";

describe("daemon logger", () => {
	const mockWrite = vi.fn().mockReturnValue(true);
	const mockEnd = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(createWriteStream).mockReturnValue({
			write: mockWrite,
			end: mockEnd,
		} as unknown as ReturnType<typeof createWriteStream>);
	});

	afterEach(() => {
		closeLogger();
	});

	it("truncates the log file on init by using flags=w", () => {
		initLogger();
		expect(createWriteStream).toHaveBeenCalledWith("/tmp/.websculpt/daemon.log", { flags: "w" });
	});

	it("writes a valid NDJSON entry with time, level, and event fields", () => {
		initLogger();
		logEvent("INFO", "daemon_start", { pid: 1234 });

		expect(mockWrite).toHaveBeenCalledTimes(1);
		const line = mockWrite.mock.calls[0][0] as string;
		const entry = JSON.parse(line.trim());

		expect(entry).toHaveProperty("time");
		expect(entry).toHaveProperty("level", "INFO");
		expect(entry).toHaveProperty("event", "daemon_start");
		expect(entry).toHaveProperty("pid", 1234);
		expect(new Date(entry.time).toISOString()).toBe(entry.time);
	});

	it("includes additional contextual fields per event type", () => {
		initLogger();
		logEvent("INFO", "req_end", { method: "run", duration_ms: 150, success: true });

		const line = mockWrite.mock.calls[0][0] as string;
		const entry = JSON.parse(line.trim());

		expect(entry).toMatchObject({
			level: "INFO",
			event: "req_end",
			method: "run",
			duration_ms: 150,
			success: true,
		});
	});

	it("does not write after closeLogger is called", () => {
		initLogger();
		closeLogger();
		logEvent("INFO", "daemon_start");

		expect(mockWrite).not.toHaveBeenCalled();
		expect(mockEnd).toHaveBeenCalledTimes(1);
	});
});
