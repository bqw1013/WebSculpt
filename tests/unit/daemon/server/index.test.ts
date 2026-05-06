import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockUnlink = vi.fn().mockResolvedValue(undefined);
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockCloseBrowser = vi.fn().mockResolvedValue(undefined);
const mockServerClose = vi.fn();
const mockServerOn = vi.fn();
const mockCreateWriteStream = vi.fn().mockReturnValue({
	end: vi.fn(),
	write: vi.fn().mockReturnValue(true),
});

vi.mock("node:fs", () => ({
	createWriteStream: mockCreateWriteStream,
}));

vi.mock("node:fs/promises", async () => {
	const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
	return {
		...actual,
		unlink: mockUnlink,
		mkdir: mockMkdir,
		writeFile: mockWriteFile,
	};
});

vi.mock("../../../../src/daemon/server/executor/browser-manager.js", () => ({
	closeBrowser: mockCloseBrowser,
	isBrowserConnected: vi.fn().mockReturnValue(false),
	withBrowser: vi.fn(),
}));

vi.mock("../../../../src/daemon/shared/paths.js", () => ({
	getDaemonStateDir: vi.fn().mockReturnValue("/tmp/.websculpt"),
	getSocketPath: vi.fn().mockReturnValue("/tmp/.websculpt/daemon.sock"),
}));

vi.mock("../../../../src/daemon/server/executor/socket-server.js", () => ({
	createSocketServer: vi.fn().mockReturnValue({
		close: mockServerClose,
		on: mockServerOn,
	}),
	getExecutionCount: vi.fn().mockReturnValue(0),
}));

describe("daemon gracefulShutdown", () => {
	let gracefulShutdown: () => Promise<void>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeAll(async () => {
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		const mod = await import("../../../../src/daemon/server/index.js");
		gracefulShutdown = mod.gracefulShutdown;
	});

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const expectedStatePath = join("/tmp/.websculpt", "daemon.json");

	it("deletes daemon.json during shutdown", async () => {
		await gracefulShutdown();
		expect(mockUnlink).toHaveBeenCalledWith(expectedStatePath);
	});

	it("deletes daemon.json even when closeBrowser throws", async () => {
		mockCloseBrowser.mockRejectedValueOnce(new Error("browser crash"));
		await gracefulShutdown();
		expect(mockUnlink).toHaveBeenCalledWith(expectedStatePath);
	});

	it("deletes daemon.json even when server.close throws", async () => {
		mockServerClose.mockImplementationOnce(() => {
			throw new Error("server close error");
		});
		await gracefulShutdown();
		expect(mockUnlink).toHaveBeenCalledWith(expectedStatePath);
	});

	it("force-exits after 5 seconds when server.close callback never fires", async () => {
		// server.close is mocked to do nothing (no callback invocation).
		await gracefulShutdown();
		expect(exitSpy).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(5000);
		expect(exitSpy).toHaveBeenCalledWith(0);
	});
});
