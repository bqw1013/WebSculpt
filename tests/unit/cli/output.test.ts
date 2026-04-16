import { describe, expect, it, vi } from "vitest";
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
					{ domain: "example", action: "hello", type: "builtin", id: "example-hello", description: "Say hello" },
				],
			},
			"human",
		);
		expect(logSpy).toHaveBeenCalledWith("builtin example/hello (example-hello) — Say hello");
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
		renderOutput(
			{ success: false, error: { code: "RESERVED_DOMAIN", message: "Domain is reserved" } },
			"human",
		);
		expect(logSpy).toHaveBeenCalledWith("RESERVED_DOMAIN: Domain is reserved");
		logSpy.mockRestore();
	});

	it("prints an error as JSON in json mode", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		renderOutput(
			{ success: false, error: { code: "NOT_FOUND", message: "Missing" } },
			"json",
		);
		expect(logSpy).toHaveBeenCalledWith(
			JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Missing" } }, null, 2),
		);
		logSpy.mockRestore();
	});
});
