import { describe, expect, it, vi } from "vitest";
import { runCommand } from "../../../../src/cli/engine/execution/dispatcher.js";

vi.mock("../../../../src/daemon/client/index.js", () => ({
	ensureDaemonClient: vi.fn(),
}));

import { ensureDaemonClient } from "../../../../src/daemon/client/index.js";

const mockManifest = (runtime: string) => ({
	id: "test-command",
	domain: "test",
	action: "cmd",
	description: "Test command",
	runtime,
	parameters: [],
});

describe("runCommand browser timeout classification", () => {
	it("classifies SOCKET_TIMEOUT as TIMEOUT", async () => {
		const timeoutError = new Error("Socket request timed out");
		(timeoutError as Error & { code: string }).code = "SOCKET_TIMEOUT";

		vi.mocked(ensureDaemonClient).mockResolvedValue({
			run: vi.fn().mockRejectedValue(timeoutError),
		});

		await expect(runCommand(mockManifest("browser") as never, "/tmp/cmd.js", {})).rejects.toSatisfy(
			(err: Error & { code?: string }) => err.code === "TIMEOUT",
		);
	});

	it("does not misclassify business errors containing timeout as TIMEOUT", async () => {
		const businessError = new Error("Connection timeout to third-party API");
		(businessError as Error & { code: string }).code = "AUTH_REQUIRED";

		vi.mocked(ensureDaemonClient).mockResolvedValue({
			run: vi.fn().mockRejectedValue(businessError),
		});

		await expect(runCommand(mockManifest("browser") as never, "/tmp/cmd.js", {})).rejects.toSatisfy(
			(err: Error & { code?: string }) => err.code === "AUTH_REQUIRED",
		);
	});

	it("does not misclassify generic errors containing timeout as TIMEOUT", async () => {
		const genericError = new Error("Request timeout from upstream service");

		vi.mocked(ensureDaemonClient).mockResolvedValue({
			run: vi.fn().mockRejectedValue(genericError),
		});

		await expect(runCommand(mockManifest("browser") as never, "/tmp/cmd.js", {})).rejects.toSatisfy(
			(err: Error & { code?: string }) => err.code === "COMMAND_EXECUTION_ERROR",
		);
	});

	it("does not infer business codes from message text when err.code is absent", async () => {
		const inferredError = new Error("NOT_FOUND in module foo");

		vi.mocked(ensureDaemonClient).mockResolvedValue({
			run: vi.fn().mockRejectedValue(inferredError),
		});

		await expect(runCommand(mockManifest("browser") as never, "/tmp/cmd.js", {})).rejects.toSatisfy(
			(err: Error & { code?: string }) =>
				err.code === "COMMAND_EXECUTION_ERROR" && err.message === "NOT_FOUND in module foo",
		);
	});

	it("preserves business error codes directly from err.code", async () => {
		const businessError = new Error("Please log in to Zhihu");
		(businessError as Error & { code: string }).code = "AUTH_REQUIRED";

		vi.mocked(ensureDaemonClient).mockResolvedValue({
			run: vi.fn().mockRejectedValue(businessError),
		});

		await expect(runCommand(mockManifest("browser") as never, "/tmp/cmd.js", {})).rejects.toSatisfy(
			(err: Error & { code?: string }) => err.code === "AUTH_REQUIRED" && err.message === "Please log in to Zhihu",
		);
	});
});
