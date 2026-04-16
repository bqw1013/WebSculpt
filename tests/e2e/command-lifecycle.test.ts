import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createIsolatedHome,
	parseJsonOutput,
	removeTempDir,
	runSourceCli,
	websculptPath,
} from "./helpers/cli";

interface CommandCreateResult {
	command?: string;
	error?: {
		code: string;
		message: string;
	};
	path?: string;
	success: boolean;
}

interface CommandRemoveResult {
	command?: string;
	error?: {
		code: string;
		message: string;
	};
	success: boolean;
}

describe("source CLI: command workflows", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("lists the built-in example command in a fresh environment", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const result = await runSourceCli(["command", "list"], homeDir);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain("builtin");
		expect(result.stdout).toContain("example");
		expect(result.stdout).toContain("hello");
	});

	it("creates a user command, lists it, and runs it through the source CLI", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const commandPackagePath = join(homeDir, "note-save-package.json");
		const packageBody = {
			code: 'export default async function(params) { return { saved: true, title: params.title ?? "untitled" }; }\n',
			manifest: {
				action: "save",
				description: "Save a note",
				domain: "notes",
				id: "notes-save",
				parameters: ["title"],
				runtime: "node",
			},
		};

		await writeFile(commandPackagePath, JSON.stringify(packageBody, null, 2), "utf8");

		const createResult = await runSourceCli(
			["command", "create", "notes", "save", "--from-file", commandPackagePath],
			homeDir,
		);
		const createPayload = parseJsonOutput<CommandCreateResult>(createResult.stdout);

		expect(createResult.exitCode).toBe(0);
		expect(createPayload).toEqual(
			expect.objectContaining({
				command: "notes/save",
				success: true,
			}),
		);
		expect(createPayload.path).toBe(websculptPath(homeDir, "commands", "notes", "save"));

		const listResult = await runSourceCli(["command", "list"], homeDir);
		expect(listResult.exitCode).toBe(0);
		expect(listResult.stdout).toContain("user");
		expect(listResult.stdout).toContain("notes");
		expect(listResult.stdout).toContain("save");

		const runResult = await runSourceCli(["notes", "save", "--title", "Draft"], homeDir);
		const runPayload = parseJsonOutput<{
			command: string;
			data: { saved: boolean; title: string };
			success: boolean;
		}>(runResult.stdout);

		expect(runResult.exitCode).toBe(0);
		expect(runPayload).toEqual(
			expect.objectContaining({
				command: "notes/save",
				success: true,
			}),
		);
		expect(runPayload.data).toEqual({
			saved: true,
			title: "Draft",
		});
	});

	it("returns a structured error payload when a reserved domain is used", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const commandPackagePath = join(homeDir, "reserved-command-package.json");
		const packageBody = {
			code: 'export default async function() { return { ok: true }; }\n',
			manifest: {
				action: "sync",
				description: "Should not be created",
				domain: "command",
				id: "command-sync",
				parameters: [],
				runtime: "node",
			},
		};

		await writeFile(commandPackagePath, JSON.stringify(packageBody, null, 2), "utf8");

		const result = await runSourceCli(
			["command", "create", "command", "sync", "--from-file", commandPackagePath],
			homeDir,
		);
		const payload = parseJsonOutput<CommandCreateResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error).toEqual(
			expect.objectContaining({
				code: "RESERVED_DOMAIN",
			}),
		);
	});

	it("removes a user command and confirms absence via list", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const commandPackagePath = join(homeDir, "note-delete-package.json");
		const packageBody = {
			code: 'export default async function() { return { deleted: true }; }\n',
			manifest: {
				action: "delete",
				description: "Delete a note",
				domain: "notes",
				id: "notes-delete",
				parameters: [],
				runtime: "node",
			},
		};

		await writeFile(commandPackagePath, JSON.stringify(packageBody, null, 2), "utf8");

		const createResult = await runSourceCli(
			["command", "create", "notes", "delete", "--from-file", commandPackagePath],
			homeDir,
		);
		const createPayload = parseJsonOutput<CommandCreateResult>(createResult.stdout);
		expect(createResult.exitCode).toBe(0);
		expect(createPayload.success).toBe(true);

		const removeResult = await runSourceCli(["command", "remove", "notes", "delete"], homeDir);
		const removePayload = parseJsonOutput<CommandRemoveResult>(removeResult.stdout);
		expect(removeResult.exitCode).toBe(0);
		expect(removePayload).toEqual(
			expect.objectContaining({
				command: "notes/delete",
				success: true,
			}),
		);

		const listResult = await runSourceCli(["command", "list"], homeDir);
		expect(listResult.exitCode).toBe(0);
		expect(listResult.stdout).not.toContain("notes");
		expect(listResult.stdout).not.toContain("delete");
	});

	it("forbids removal of built-in commands", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const result = await runSourceCli(["command", "remove", "example", "hello"], homeDir);
		const payload = parseJsonOutput<CommandRemoveResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error).toEqual(
			expect.objectContaining({
				code: "CANNOT_REMOVE_BUILTIN",
			}),
		);
	});
});
