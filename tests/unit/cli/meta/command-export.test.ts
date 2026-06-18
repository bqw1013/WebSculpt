import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedCommand } from "../../../../src/cli/engine/contract.js";
import { handleCommandExport } from "../../../../src/cli/meta/command/export.js";

// We test the identifier resolution logic by mocking listAllCommands and
// calling handleCommandExport with a temporary output directory.

vi.mock("../../../../src/cli/engine/registry.js", () => ({
	listAllCommands: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		copyFile: vi.fn().mockResolvedValue(undefined),
		mkdir: vi.fn().mockResolvedValue(undefined),
		rm: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn().mockResolvedValue(undefined),
		access: vi.fn().mockRejectedValue(new Error("ENOENT")),
		readdir: vi.fn().mockResolvedValue([]),
	};
});

function buildMockCommand(domain: string, action: string, source: "user" | "builtin" = "user"): ResolvedCommand {
	return {
		manifest: {
			id: `${domain}-${action}`,
			domain,
			action,
			description: `${domain} ${action} command`,
			runtime: "node",
			parameters: [],
			requiresBrowser: false,
		},
		commandPath: `/home/.websculpt/commands/${domain}/${action}/command.js`,
		source,
		runtime: "node",
	};
}

import { listAllCommands } from "../../../../src/cli/engine/registry.js";

describe("handleCommandExport identifier resolution", () => {
	// Use a temporary directory inside the test temp area
	const tmpDir = join("/tmp", "websculpt-export-test");

	it("exports all resolved commands when no identifiers are given", async () => {
		const mockCmds = [
			buildMockCommand("notes", "save"),
			buildMockCommand("notes", "delete"),
			buildMockCommand("tasks", "list"),
		];
		vi.mocked(listAllCommands).mockReturnValue(mockCmds);

		const result = await handleCommandExport([], { to: tmpDir });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.exported).toHaveLength(3);
			expect(new Set(result.exported)).toEqual(new Set(["notes/save", "notes/delete", "tasks/list"]));
		}
	});

	it("exports only commands in the specified domain", async () => {
		const mockCmds = [
			buildMockCommand("notes", "save"),
			buildMockCommand("notes", "delete"),
			buildMockCommand("tasks", "list"),
		];
		vi.mocked(listAllCommands).mockReturnValue(mockCmds);

		const result = await handleCommandExport(["notes"], { to: tmpDir });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.exported).toEqual(["notes/delete", "notes/save"]);
		}
	});

	it("exports a single command by domain/action identifier", async () => {
		const mockCmds = [buildMockCommand("notes", "save"), buildMockCommand("tasks", "list")];
		vi.mocked(listAllCommands).mockReturnValue(mockCmds);

		const result = await handleCommandExport(["notes/save"], { to: tmpDir });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.exported).toEqual(["notes/save"]);
		}
	});

	it("returns union of matches for mixed identifiers", async () => {
		const mockCmds = [
			buildMockCommand("notes", "save"),
			buildMockCommand("notes", "delete"),
			buildMockCommand("tasks", "list"),
			buildMockCommand("tasks", "complete"),
		];
		vi.mocked(listAllCommands).mockReturnValue(mockCmds);

		const result = await handleCommandExport(["notes/save", "tasks"], { to: tmpDir });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.exported).toHaveLength(3);
			expect(result.exported).toContain("notes/save");
			expect(result.exported).toContain("tasks/list");
			expect(result.exported).toContain("tasks/complete");
		}
	});

	it("returns NO_COMMANDS_MATCHED when no commands match any identifier", async () => {
		vi.mocked(listAllCommands).mockReturnValue([]);

		const result = await handleCommandExport(["nonexistent"], { to: tmpDir });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("NO_COMMANDS_MATCHED");
		}
	});

	it("excludes duplicate matches across identifiers", async () => {
		const mockCmds = [buildMockCommand("notes", "save"), buildMockCommand("notes", "delete")];
		vi.mocked(listAllCommands).mockReturnValue(mockCmds);

		const result = await handleCommandExport(["notes", "notes/save"], { to: tmpDir });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.exported).toEqual(["notes/delete", "notes/save"]);
		}
	});
});

describe("handleCommandExport directory safety", () => {
	const tmpDir = join("/tmp", "websculpt-export-nonempty");

	it("rejects non-empty target directory", async () => {
		vi.mocked(listAllCommands).mockReturnValue([buildMockCommand("notes", "save")]);

		// readdir returns non-empty array, simulating existing directory content
		const { readdir } = await import("node:fs/promises");
		vi.mocked(readdir).mockResolvedValueOnce(["existing-file.txt"] as unknown as import("node:fs").Dirent[]);

		const result = await handleCommandExport([], { to: tmpDir });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("DIRECTORY_NOT_EMPTY");
		}
	});
});
