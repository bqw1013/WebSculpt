import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/cli/daemon/observability/logger.js", () => ({
	logEvent: vi.fn(),
}));

vi.mock("../../../../src/cli/daemon/observability/metrics.js", () => ({
	recordPeakRss: vi.fn(),
	recordPeakPages: vi.fn(),
}));

vi.mock("../../../../src/cli/daemon/runtime/browser-manager.js", () => ({
	getOpenPageCount: vi.fn().mockReturnValue(0),
}));

import { logEvent } from "../../../../src/cli/daemon/observability/logger.js";
import {
	degraded,
	resetMonitorState,
	restartPending,
	startMemoryMonitoring,
	stopMemoryMonitoring,
} from "../../../../src/cli/daemon/runtime/memory-monitor.js";

describe("memory monitor state transitions", () => {
	beforeEach(() => {
		resetMonitorState();
		vi.clearAllMocks();
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		stopMemoryMonitoring();
		vi.useRealTimers();
	});

	it("does nothing when RSS is below warning threshold", () => {
		const onEmergency = vi.fn();
		vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 300 * 1024 * 1024 } as NodeJS.MemoryUsage);

		startMemoryMonitoring(onEmergency);
		vi.advanceTimersByTime(60_000);

		expect(degraded).toBe(false);
		expect(restartPending).toBe(false);
		expect(onEmergency).not.toHaveBeenCalled();
	});

	it("sets degraded to true when RSS exceeds warning threshold (400MB)", () => {
		const onEmergency = vi.fn();
		vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 450 * 1024 * 1024 } as NodeJS.MemoryUsage);

		startMemoryMonitoring(onEmergency);
		vi.advanceTimersByTime(60_000);

		expect(degraded).toBe(true);
		expect(restartPending).toBe(false);
		expect(onEmergency).not.toHaveBeenCalled();
		expect(logEvent).toHaveBeenCalledWith("WARN", "mem_high", expect.any(Object));
	});

	it("sets restartPending to true when RSS exceeds limit threshold (600MB)", () => {
		const onEmergency = vi.fn();
		vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 650 * 1024 * 1024 } as NodeJS.MemoryUsage);

		startMemoryMonitoring(onEmergency);
		vi.advanceTimersByTime(60_000);

		expect(restartPending).toBe(true);
		expect(onEmergency).not.toHaveBeenCalled();
		expect(logEvent).toHaveBeenCalledWith("WARN", "daemon_shutdown", expect.any(Object));
	});

	it("calls onEmergency when RSS exceeds emergency threshold (1000MB)", () => {
		const onEmergency = vi.fn();
		vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 1100 * 1024 * 1024 } as NodeJS.MemoryUsage);

		startMemoryMonitoring(onEmergency);
		vi.advanceTimersByTime(60_000);

		expect(onEmergency).toHaveBeenCalledTimes(1);
	});

	it("recovers from degraded when RSS drops back below warning threshold", () => {
		const onEmergency = vi.fn();
		const memSpy = vi.spyOn(process, "memoryUsage");

		memSpy.mockReturnValue({ rss: 450 * 1024 * 1024 } as NodeJS.MemoryUsage);
		startMemoryMonitoring(onEmergency);
		vi.advanceTimersByTime(60_000);
		expect(degraded).toBe(true);

		memSpy.mockReturnValue({ rss: 300 * 1024 * 1024 } as NodeJS.MemoryUsage);
		vi.advanceTimersByTime(60_000);
		expect(degraded).toBe(false);
		expect(onEmergency).not.toHaveBeenCalled();
	});

	it("samples memory at 60-second intervals", () => {
		const onEmergency = vi.fn();
		vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 300 * 1024 * 1024 } as NodeJS.MemoryUsage);

		startMemoryMonitoring(onEmergency);
		expect(process.memoryUsage).not.toHaveBeenCalled();

		vi.advanceTimersByTime(60_000);
		expect(process.memoryUsage).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(60_000);
		expect(process.memoryUsage).toHaveBeenCalledTimes(2);
	});
});
