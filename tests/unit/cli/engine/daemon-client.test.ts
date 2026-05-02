import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		readFile: vi.fn(),
		unlink: vi.fn(),
		writeFile: vi.fn(),
		mkdir: vi.fn(),
	};
});

vi.mock("node:net", () => ({
	createConnection: vi.fn(),
}));

vi.mock("../../../../src/cli/engine/daemon-client.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../../src/cli/engine/daemon-client.js")>();
	return {
		...actual,
		ensureDaemonClient: vi.fn().mockResolvedValue({
			run: vi.fn().mockResolvedValue("ok"),
		}),
	};
});

import { readFile, unlink } from "node:fs/promises";
import { createConnection } from "node:net";
import { createClient } from "../../../../src/cli/engine/daemon-client.js";

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

		const client = createClient({ pid: 1234, socketPath: "\\.\\pipe\\test" });

		await expect(client.run("/tmp/cmd.js", {})).rejects.toThrow();
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

		const client = createClient({ pid: 1234, socketPath: "\\.\\pipe\\test" });

		await expect(client.run("/tmp/cmd.js", {})).rejects.toThrow();
		const sigtermCalls = killSpy.mock.calls.filter((call) => call[1] === "SIGTERM");
		expect(sigtermCalls).toHaveLength(0);
		expect(unlink).not.toHaveBeenCalled();
	});
});
