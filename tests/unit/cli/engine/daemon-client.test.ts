import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		readFile: vi.fn(),
		unlink: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn(),
		mkdir: vi.fn(),
		open: vi.fn().mockResolvedValue({
			close: vi.fn().mockResolvedValue(undefined),
		}),
	};
});

vi.mock("node:net", () => ({
	createConnection: vi.fn(),
}));

import { readFile, unlink } from "node:fs/promises";
import { createConnection } from "node:net";
import { createClient } from "../../../../src/cli/engine/daemon/client.js";

describe("createClient PID ownership", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("kills daemon and clears state when current PID matches recorded PID", async () => {
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

		vi.mocked(readFile).mockImplementation(async () => JSON.stringify({ pid: 1234, socketPath: "\\.\\pipe\\test" }));

		vi.mocked(createConnection).mockImplementation(() => {
			const socket = {
				setEncoding: vi.fn(),
				write: vi.fn(),
				destroy: vi.fn(),
				on: vi.fn((event: string, handler: unknown) => {
					if (event === "error") {
						setImmediate(() => {
							const err = new Error("ECONNREFUSED") as Error & { code: string };
							err.code = "ECONNREFUSED";
							(handler as (e: Error) => void)(err);
						});
					}
				}),
			};
			return socket as unknown as ReturnType<typeof createConnection>;
		});

		const mockEnsure = vi.fn().mockRejectedValue(new Error("retry failed"));
		const client = createClient({ pid: 1234, socketPath: "\\.\\pipe\\test" }, mockEnsure);

		await expect(client.run("/tmp/cmd.js", {})).rejects.toThrow("retry failed");
		expect(killSpy).toHaveBeenCalledWith(1234, "SIGTERM");
		expect(unlink).toHaveBeenCalled();
	});

	it("does not kill daemon when current PID differs from recorded PID", async () => {
		const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

		vi.mocked(readFile).mockImplementation(async () => JSON.stringify({ pid: 5678, socketPath: "\\.\\pipe\\test" }));

		vi.mocked(createConnection).mockImplementation(() => {
			const socket = {
				setEncoding: vi.fn(),
				write: vi.fn(),
				destroy: vi.fn(),
				on: vi.fn((event: string, handler: unknown) => {
					if (event === "error") {
						setImmediate(() => {
							const err = new Error("ECONNREFUSED") as Error & { code: string };
							err.code = "ECONNREFUSED";
							(handler as (e: Error) => void)(err);
						});
					}
				}),
			};
			return socket as unknown as ReturnType<typeof createConnection>;
		});

		const mockEnsure = vi.fn().mockRejectedValue(new Error("retry failed"));
		const client = createClient({ pid: 1234, socketPath: "\\.\\pipe\\test" }, mockEnsure);

		await expect(client.run("/tmp/cmd.js", {})).rejects.toThrow("retry failed");
		const sigtermCalls = killSpy.mock.calls.filter((call) => call[1] === "SIGTERM");
		expect(sigtermCalls).toHaveLength(0);
		// Lock file cleanup from acquireDaemonLock may call unlink; ensure daemon.json is NOT removed.
		const daemonJsonUnlinks = vi.mocked(unlink).mock.calls.filter((call) => String(call[0]).includes("daemon.json"));
		expect(daemonJsonUnlinks).toHaveLength(0);
	});
});
