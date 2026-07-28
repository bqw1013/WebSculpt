import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/daemon/server/observability/logger.js", () => ({
	logEvent: vi.fn(),
}));

vi.mock("../../../../src/daemon/server/observability/metrics.js", () => ({
	recordPeakRss: vi.fn(),
	recordPeakPages: vi.fn(),
}));

vi.mock("../../../../src/daemon/server/executor/browser-manager.js", () => ({
	getOpenPageCount: vi.fn().mockReturnValue(0),
}));

import {
	degraded,
	resetMonitorState,
	restartPending,
	startMemoryMonitoring,
	stopMemoryMonitoring,
} from "../../../../src/daemon/server/executor/memory-monitor.js";
import { logEvent } from "../../../../src/daemon/server/observability/logger.js";

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

	it("sets degraded and requests cleanup when RSS exceeds warning threshold", () => {
		const onEmergency = vi.fn();
		const onMemoryPressure = vi.fn();
		vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 550 * 1024 * 1024 } as NodeJS.MemoryUsage);

		startMemoryMonitoring(onEmergency, onMemoryPressure);
		vi.advanceTimersByTime(60_000);

		expect(degraded).toBe(true);
		expect(restartPending).toBe(false);
		expect(onEmergency).not.toHaveBeenCalled();
		expect(onMemoryPressure).toHaveBeenCalledTimes(1);
		expect(logEvent).toHaveBeenCalledWith("WARN", "mem_high", expect.any(Object));
	});

	it("requires consecutive over-limit samples before requesting restart", () => {
		const onEmergency = vi.fn();
		vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 850 * 1024 * 1024 } as NodeJS.MemoryUsage);

		startMemoryMonitoring(onEmergency);
		vi.advanceTimersByTime(60_000);
		expect(restartPending).toBe(false);

		vi.advanceTimersByTime(60_000);
		expect(restartPending).toBe(true);
		expect(onEmergency).not.toHaveBeenCalled();
		expect(logEvent).toHaveBeenCalledWith("WARN", "daemon_shutdown", expect.any(Object));
	});

	it("resets consecutive limit samples when RSS drops below the limit", () => {
		const onEmergency = vi.fn();
		const memSpy = vi.spyOn(process, "memoryUsage");

		memSpy.mockReturnValue({ rss: 850 * 1024 * 1024 } as NodeJS.MemoryUsage);
		startMemoryMonitoring(onEmergency);
		vi.advanceTimersByTime(60_000);

		memSpy.mockReturnValue({ rss: 700 * 1024 * 1024 } as NodeJS.MemoryUsage);
		vi.advanceTimersByTime(60_000);

		memSpy.mockReturnValue({ rss: 850 * 1024 * 1024 } as NodeJS.MemoryUsage);
		vi.advanceTimersByTime(60_000);
		expect(restartPending).toBe(false);
	});

	it("calls onEmergency when RSS exceeds emergency threshold", () => {
		const onEmergency = vi.fn();
		vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 1250 * 1024 * 1024 } as NodeJS.MemoryUsage);

		startMemoryMonitoring(onEmergency);
		vi.advanceTimersByTime(60_000);

		expect(onEmergency).toHaveBeenCalledTimes(1);
	});

	it("recovers from degraded when RSS drops back below warning threshold", () => {
		const onEmergency = vi.fn();
		const memSpy = vi.spyOn(process, "memoryUsage");

		memSpy.mockReturnValue({ rss: 550 * 1024 * 1024 } as NodeJS.MemoryUsage);
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
