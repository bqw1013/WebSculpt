import { describe, expect, it, vi } from "vitest";
import type { CaptureNewResult } from "../../../src/cli/output.js";
import { renderOutput } from "../../../src/cli/output.js";

describe("renderOutput", () => {
	it("prints pretty-printed JSON for a create success in json mode", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput({ success: true, command: "notes/save", path: "/tmp/notes/save" }, "json");
		expect(logSpy).toHaveBeenCalledWith(
			JSON.stringify({ success: true, command: "notes/save", path: "/tmp/notes/save" }, null, 2),
		);
		logSpy.mockRestore();
	});

	it("prints a human confirmation for a create success", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput({ success: true, command: "notes/save", path: "/tmp/notes/save" }, "human");
		expect(logSpy).toHaveBeenCalledWith("Created command notes/save at /tmp/notes/save");
		logSpy.mockRestore();
	});

	it("prints a human confirmation for a remove success", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput({ success: true, command: "notes/delete" }, "human");
		expect(logSpy).toHaveBeenCalledWith("Removed command notes/delete");
		logSpy.mockRestore();
	});

	it("prints a human message for config init success", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput({ success: true, message: "WebSculpt initialized." }, "human");
		expect(logSpy).toHaveBeenCalledWith("WebSculpt initialized.");
		logSpy.mockRestore();
	});

	it("prints a concise list in human mode when commands exist", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput(
			{
				success: true,
				commands: [
					{
						domain: "example",
						action: "hello",
						type: "builtin",
						id: "example-hello",
						description: "Say hello",
						requiresBrowser: false,
						authRequired: "unknown",
					},
				],
			},
			"human",
		);
		expect(logSpy).toHaveBeenCalledTimes(2);
		expect(logSpy).toHaveBeenNthCalledWith(1, "Command                  Source   Browser  Login  Description");
		expect(logSpy).toHaveBeenNthCalledWith(2, "websculpt example hello  builtin  no              Say hello");
		logSpy.mockRestore();
	});

	it("prints 'No commands available.' in human mode for an empty list", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput({ success: true, commands: [] }, "human");
		expect(logSpy).toHaveBeenCalledWith("No commands available.");
		logSpy.mockRestore();
	});

	it("prints an error in human mode as CODE: message", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput({ success: false, error: { code: "RESERVED_DOMAIN", message: "Domain is reserved" } }, "human");
		expect(logSpy).toHaveBeenCalledWith("RESERVED_DOMAIN: Domain is reserved");
		logSpy.mockRestore();
	});

	it("prints an error as JSON in json mode", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput({ success: false, error: { code: "NOT_FOUND", message: "Missing" } }, "json");
		expect(logSpy).toHaveBeenCalledWith(
			JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Missing" } }, null, 2),
		);
		logSpy.mockRestore();
	});

	it("prints a human-readable contract card for command show", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput(
			{
				success: true,
				command: {
					id: "example-hello",
					domain: "example",
					action: "hello",
					description: "Say hello",
					runtime: "node",
					source: "builtin",
					path: "/tmp/example/hello",
					entryFile: "command.js",
					parameters: [],
					prerequisites: [],
					assets: { manifest: true, readme: true, context: true, entryFile: true },
					requiresBrowser: false,
				},
			},
			"human",
		);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("example-hello"));
		logSpy.mockRestore();
	});

	it("appends README content after the contract card in human mode when readmeContent is present", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput(
			{
				success: true,
				command: {
					id: "example-hello",
					domain: "example",
					action: "hello",
					description: "Say hello",
					runtime: "node",
					source: "builtin",
					path: "/tmp/example/hello",
					entryFile: "command.js",
					parameters: [],
					prerequisites: [],
					assets: { manifest: true, readme: true, context: true, entryFile: true },
					requiresBrowser: false,
				},
				readmeContent: "# Usage\nRun with --name",
			},
			"human",
		);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("example-hello"));
		expect(logSpy).toHaveBeenCalledWith("--- README ---");
		expect(logSpy).toHaveBeenCalledWith("# Usage\nRun with --name");
		logSpy.mockRestore();
	});

	it("prints a capture new result as JSON", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const result = createCaptureNewResult();

		renderOutput(result, "json");

		expect(logSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
		logSpy.mockRestore();
	});

	it("prints a human-readable capture new summary", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		renderOutput(createCaptureNewResult(), "human");

		expect(logSpy).toHaveBeenCalledWith("Capture workspace created at /tmp/.websculpt-captures/github-trending");
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("github/list-trending"));
		expect(logSpy).toHaveBeenCalledWith("Next: websculpt capture status github-trending");
		logSpy.mockRestore();
	});
});

function createCaptureNewResult(): CaptureNewResult {
	return {
		success: true,
		capture: {
			name: "github-trending",
			path: "/tmp/.websculpt-captures/github-trending",
			domain: "github",
			action: "list-trending",
			runtime: "browser",
		},
		commandLibrarySnapshot: {
			totalCommands: 2,
			sameDomainCommands: ["github/list-trending"],
			nameConflict: true,
			conflictSource: "builtin",
		},
		summary: {
			domain: "github",
			action: "list-trending",
			duplicateWarning: "Builtin command exists",
			estimatedSteps: 5,
		},
		next: "websculpt capture status github-trending",
		warnings: [
			{
				code: "BUILTIN_OVERRIDE",
				message: "Builtin command already exists",
				level: "warning",
			},
		],
	};
}
