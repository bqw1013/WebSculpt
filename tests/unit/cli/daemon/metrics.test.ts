import { mkdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/cli/daemon/config/paths.js", async () => {
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = join(tmpdir(), "websculpt-metrics-test-fixed");
	return {
		getDaemonStateDir: vi.fn().mockReturnValue(dir),
		getDaemonLogPath: vi.fn().mockReturnValue(join(dir, "daemon.log")),
	};
});

import { getDaemonStateDir } from "../../../../src/cli/daemon/config/paths.js";
import {
	flushMetrics,
	recordExecutionEnd,
	recordExecutionStart,
	recordPeakPages,
	recordPeakRss,
	resetMetrics,
} from "../../../../src/cli/daemon/observability/metrics.js";

describe("metrics tracking and serialization", () => {
	let metricsDir: string;

	beforeEach(async () => {
		resetMetrics();
		metricsDir = getDaemonStateDir();
		await mkdir(metricsDir, { recursive: true });
	});

	afterEach(async () => {
		try {
			await unlink(join(metricsDir, "daemon-metrics.json"));
		} catch {
			// ignore
		}
	});

	it("tracks peak concurrent sessions", () => {
		recordExecutionStart(1);
		recordExecutionStart(3);
		recordExecutionStart(2);
		// peak should be 3
	});

	it("tracks execution success and error counts", () => {
		recordExecutionStart(1);
		recordExecutionEnd(true);
		recordExecutionStart(1);
		recordExecutionEnd(false);
		recordExecutionStart(1);
		recordExecutionEnd(true);
	});

	it("tracks peak pages and peak RSS", () => {
		recordPeakPages(5);
		recordPeakPages(10);
		recordPeakPages(8);

		recordPeakRss(100);
		recordPeakRss(200);
		recordPeakRss(150);
	});

	it("flushes metrics to daemon-metrics.json with correct shape", async () => {
		recordExecutionStart(1);
		recordExecutionEnd(true);
		recordPeakPages(12);
		recordPeakRss(256);

		await flushMetrics("exec_limit");

		const raw = await readFile(join(metricsDir, "daemon-metrics.json"), "utf-8");
		const snapshot = JSON.parse(raw);

		expect(snapshot).toHaveProperty("session");
		expect(snapshot.session.totalExecutions).toBe(1);
		expect(snapshot.session.successCount).toBe(1);
		expect(snapshot.session.errorCount).toBe(0);
		expect(snapshot.session.peakConcurrent).toBe(1);
		expect(snapshot.session.peakPages).toBe(12);
		expect(snapshot.session.peakRssMB).toBe(256);
		expect(snapshot.session.shutdownReason).toBe("exec_limit");
		expect(typeof snapshot.session.startedAt).toBe("string");
		expect(typeof snapshot.session.endedAt).toBe("string");
		expect(typeof snapshot.session.uptimeSec).toBe("number");
	});

	it("does not throw when flush fails to write", async () => {
		vi.mocked(getDaemonStateDir).mockReturnValueOnce("/nonexistent/path/that/cannot/be/written");

		await expect(flushMetrics("test")).resolves.toBeUndefined();
	});
});
