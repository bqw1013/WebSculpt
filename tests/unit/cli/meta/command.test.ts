import { describe, expect, it, vi } from "vitest";
import { handleCommandShow } from "../../../../src/cli/meta/command/show.js";

vi.mock("../../../../src/cli/engine/registry.js", () => ({
	findCommand: vi.fn(),
}));

vi.mock("fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs/promises")>();
	return {
		...actual,
		access: vi.fn(),
		readFile: vi.fn(),
	};
});

import { access, readFile } from "node:fs/promises";
import { findCommand } from "../../../../src/cli/engine/registry.js";

describe("handleCommandShow", () => {
	it("returns NOT_FOUND when command does not exist", async () => {
		vi.mocked(findCommand).mockReturnValue(null);
		const result = await handleCommandShow("nonexistent", "action");
		expect(result).toEqual({
			success: false,
			error: {
				code: "NOT_FOUND",
				message: 'Command "nonexistent/action" does not exist.',
			},
		});
	});

	it("returns full contract card for an existing command", async () => {
		vi.mocked(findCommand).mockReturnValue({
			manifest: {
				id: "example-hello",
				domain: "example",
				action: "hello",
				description: "Say hello",
				runtime: "node",
				parameters: [{ name: "name", required: false, description: "Name to greet" }],
				prerequisites: ["Requires user login"],
				requiresBrowser: false,
			},
			commandPath: "/tmp/commands/example/hello/command.js",
			source: "builtin",
			runtime: "node",
		});
		vi.mocked(access).mockResolvedValue(undefined);

		const result = await handleCommandShow("example", "hello");
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.command.id).toBe("example-hello");
		expect(result.command.prerequisites).toContain("Requires user login");
		expect(result.command.assets).toEqual({
			manifest: true,
			readme: true,
			context: true,
			entryFile: true,
		});
	});

	it("merges system prerequisites for playwright-cli runtime", async () => {
		vi.mocked(findCommand).mockReturnValue({
			manifest: {
				id: "github-list-trending",
				domain: "github",
				action: "list-trending",
				description: "Fetch trending",
				runtime: "playwright-cli",
				requiresBrowser: true,
			},
			commandPath: "/tmp/commands/github/list-trending/command.js",
			source: "builtin",
			runtime: "playwright-cli",
		});
		vi.mocked(access).mockResolvedValue(undefined);

		const result = await handleCommandShow("github", "list-trending");
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.command.prerequisites).toContain(
			"Requires `playwright-cli attach --cdp=chrome|msedge --session=default`",
		);
	});

	it("returns readmeContent when includeReadme is true and README.md exists", async () => {
		vi.mocked(findCommand).mockReturnValue({
			manifest: {
				id: "example-hello",
				domain: "example",
				action: "hello",
				description: "Say hello",
				runtime: "node",
				requiresBrowser: false,
			},
			commandPath: "/tmp/commands/example/hello/command.js",
			source: "builtin",
			runtime: "node",
		});
		vi.mocked(access).mockImplementation(async (path) => {
			if (String(path).endsWith("README.md")) {
				return undefined;
			}
			throw new Error("ENOENT");
		});
		vi.mocked(readFile).mockResolvedValue("# Hello\nUsage info");

		const result = await handleCommandShow("example", "hello", true);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.readmeContent).toBe("# Hello\nUsage info");
	});

	it("omits readmeContent when includeReadme is true but README.md is missing", async () => {
		vi.mocked(findCommand).mockReturnValue({
			manifest: {
				id: "example-hello",
				domain: "example",
				action: "hello",
				description: "Say hello",
				runtime: "node",
				requiresBrowser: false,
			},
			commandPath: "/tmp/commands/example/hello/command.js",
			source: "builtin",
			runtime: "node",
		});
		vi.mocked(access).mockRejectedValue(new Error("ENOENT"));

		const result = await handleCommandShow("example", "hello", true);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.readmeContent).toBeUndefined();
	});
});
