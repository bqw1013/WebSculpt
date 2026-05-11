import { type ChildProcess, spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { killDaemonProcess } from "../../../../src/daemon/client/kill-process.js";

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}));

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

describe("killDaemonProcess", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		if (originalPlatform) {
			Object.defineProperty(process, "platform", originalPlatform);
		}
	});

	it("does nothing for non-positive PID", async () => {
		await expect(killDaemonProcess(0)).resolves.toBeUndefined();
		await expect(killDaemonProcess(-1)).resolves.toBeUndefined();
		expect(spawn).not.toHaveBeenCalled();
	});

	describe("on Windows", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "win32" });
		});

		it("spawns taskkill with /T /F flags", async () => {
			const mockChild = {
				on: vi.fn((event: string, handler: () => void) => {
					if (event === "exit") {
						setImmediate(handler);
					}
				}),
			} as unknown as ChildProcess;

			vi.mocked(spawn).mockReturnValue(mockChild);

			await killDaemonProcess(1234);

			expect(spawn).toHaveBeenCalledWith(
				"taskkill",
				["/PID", "1234", "/T", "/F"],
				expect.objectContaining({ windowsHide: true, detached: true, stdio: "ignore" }),
			);
		});

		it("resolves even if spawn errors", async () => {
			const mockChild = {
				on: vi.fn((event: string, handler: () => void) => {
					if (event === "error") {
						setImmediate(handler);
					}
				}),
			} as unknown as ChildProcess;

			vi.mocked(spawn).mockReturnValue(mockChild);

			await expect(killDaemonProcess(1234)).resolves.toBeUndefined();
		});

		it("resolves on timeout fallback", async () => {
			const mockChild = {
				on: vi.fn(),
			} as unknown as ChildProcess;

			vi.mocked(spawn).mockReturnValue(mockChild);

			const promise = killDaemonProcess(1234);
			vi.advanceTimersByTime(6000);
			await expect(promise).resolves.toBeUndefined();
		});
	});

	describe("on Unix", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "linux" });
		});

		it("sends SIGTERM and resolves when process exits", async () => {
			const killSpy = vi.spyOn(process, "kill").mockImplementation((_pid: number, signal?: string | number) => {
				if (signal === 0) {
					const err = new Error("ESRCH") as NodeJS.ErrnoException;
					err.code = "ESRCH";
					throw err;
				}
				return true;
			});

			const promise = killDaemonProcess(1234);

			await expect(promise).resolves.toBeUndefined();
			expect(killSpy).toHaveBeenCalledWith(1234, "SIGTERM");
		});

		it("sends SIGKILL if process is still alive after graceful window", async () => {
			const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

			const promise = killDaemonProcess(1234);

			// Advance past the 2s graceful window (20 polls * 100ms).
			vi.advanceTimersByTime(2500);
			await expect(promise).resolves.toBeUndefined();

			const sigtermCalls = killSpy.mock.calls.filter((call) => call[1] === "SIGTERM");
			const sigkillCalls = killSpy.mock.calls.filter((call) => call[1] === "SIGKILL");
			expect(sigtermCalls).toHaveLength(1);
			expect(sigkillCalls).toHaveLength(1);
		});

		it("does not send SIGKILL if process exits during graceful window", async () => {
			let alive = true;
			const killSpy = vi.spyOn(process, "kill").mockImplementation((_pid: number, signal?: string | number) => {
				if (signal === 0 && !alive) {
					const err = new Error("ESRCH") as NodeJS.ErrnoException;
					err.code = "ESRCH";
					throw err;
				}
				if (signal === "SIGTERM") {
					alive = false;
				}
				return true;
			});

			const promise = killDaemonProcess(1234);

			vi.advanceTimersByTime(500);
			await expect(promise).resolves.toBeUndefined();

			const sigkillCalls = killSpy.mock.calls.filter((call) => call[1] === "SIGKILL");
			expect(sigkillCalls).toHaveLength(0);
		});

		it("resolves silently if SIGTERM throws (process already gone)", async () => {
			const killSpy = vi.spyOn(process, "kill").mockImplementation((_pid: number, signal?: string | number) => {
				if (signal === "SIGTERM") {
					const err = new Error("ESRCH") as NodeJS.ErrnoException;
					err.code = "ESRCH";
					throw err;
				}
				return true;
			});

			await expect(killDaemonProcess(1234)).resolves.toBeUndefined();
			expect(killSpy).toHaveBeenCalledWith(1234, "SIGTERM");
		});
	});
});
