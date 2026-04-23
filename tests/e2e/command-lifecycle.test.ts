import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CliRunResult } from "./helpers/cli";
import {
	createIsolatedHome,
	parseJsonOutput,
	removeTempDir,
	runSourceCli,
	websculptPath,
} from "./helpers/cli";

interface CommandParameter {
	name: string;
	description?: string;
	required?: boolean;
	default?: string | number | boolean;
}

interface CommandManifest {
	action: string;
	description: string;
	domain: string;
	id: string;
	parameters?: CommandParameter[];
	runtime?: "node";
}

interface CommandPackageBody {
	code: string;
	manifest: CommandManifest;
}

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

interface RegisteredUserCommand {
	createPayload: CommandCreateResult;
	createResult: CliRunResult;
}

const notesSavePackage: CommandPackageBody = {
	code: 'export default async function(params) { return { saved: true, title: params.title ?? "untitled" }; }\n',
	manifest: {
		action: "save",
		description: "Save a note",
		domain: "notes",
		id: "notes-save",
		parameters: [{ name: "title", description: "Note title" }],
		runtime: "node",
	},
};

const notesDeletePackage: CommandPackageBody = {
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

const reservedSyncPackage: CommandPackageBody = {
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

async function writeCommandDir(
	homeDir: string,
	dirName: string,
	packageBody: CommandPackageBody,
): Promise<string> {
	const commandDirPath = join(homeDir, dirName);
	await mkdir(commandDirPath, { recursive: true });
	await writeFile(join(commandDirPath, "manifest.json"), JSON.stringify(packageBody.manifest, null, 2), "utf8");
	await writeFile(join(commandDirPath, "command.js"), packageBody.code, "utf8");
	return commandDirPath;
}

async function registerUserCommand(
	homeDir: string,
	dirName: string,
	packageBody: CommandPackageBody,
): Promise<RegisteredUserCommand> {
	const commandDirPath = await writeCommandDir(homeDir, dirName, packageBody);
	const createResult = await runSourceCli(
		[
			"command",
			"create",
			packageBody.manifest.domain,
			packageBody.manifest.action,
			"--from-dir",
			commandDirPath,
			"--format",
			"json",
		],
		homeDir,
	);

	return {
		createPayload: parseJsonOutput<CommandCreateResult>(createResult.stdout),
		createResult,
	};
}

describe("source CLI: command management", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	describe("command list", () => {
		it("shows the built-in example command in a fresh environment", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const result = await runSourceCli(["command", "list"], homeDir);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain("builtin");
			expect(result.stdout).toContain("example");
			expect(result.stdout).toContain("hello");
		});

		it("shows newly created user commands alongside built-ins", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createPayload, createResult } = await registerUserCommand(
				homeDir,
				"note-save-package.json",
				notesSavePackage,
			);

			expect(createResult.exitCode).toBe(0);
			expect(createPayload.success).toBe(true);

			const listResult = await runSourceCli(["command", "list"], homeDir);

			expect(listResult.exitCode).toBe(0);
			expect(listResult.stdout).toContain("builtin");
			expect(listResult.stdout).toContain("example");
			expect(listResult.stdout).toContain("hello");
			expect(listResult.stdout).toContain("user");
			expect(listResult.stdout).toContain("notes");
			expect(listResult.stdout).toContain("save");
		});
	});

	describe("command create", () => {
		it("registers a user command from a package file", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createPayload, createResult } = await registerUserCommand(
				homeDir,
				"note-save-package.json",
				notesSavePackage,
			);

			expect(createResult.exitCode).toBe(0);
			expect(createPayload).toEqual(
				expect.objectContaining({
					command: "notes/save",
					success: true,
				}),
			);
			expect(createPayload.path).toBe(websculptPath(homeDir, "commands", "notes", "save"));
		});

		it("returns a structured error for reserved domains", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const commandDirPath = await writeCommandDir(
				homeDir,
				"reserved-command-dir",
				reservedSyncPackage,
			);
			const result = await runSourceCli(
				["command", "create", "command", "sync", "--from-dir", commandDirPath, "--format", "json"],
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

		it("returns VALIDATION_ERROR for an invalid manifest", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const invalidPackage: CommandPackageBody = {
				code: "export default async function() { return { ok: true }; }",
				manifest: {
					action: "bad",
					description: "Bad manifest",
					domain: "bad-domain",
					id: "bad-domain-wrong-id",
					parameters: [],
					runtime: "invalid-runtime",
				},
			};
			const commandDirPath = await writeCommandDir(homeDir, "invalid-command-dir", invalidPackage);
			const result = await runSourceCli(
				["command", "create", "bad-domain", "bad", "--from-dir", commandDirPath, "--format", "json"],
				homeDir,
			);
			const payload = parseJsonOutput<CommandCreateResult>(result.stdout);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(false);
			expect(payload.error).toEqual(
				expect.objectContaining({
					code: "VALIDATION_ERROR",
				}),
			);
			expect(payload.error?.details).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ code: "INVALID_RUNTIME", level: "error" }),
					expect.objectContaining({ code: "ID_MISMATCH", level: "error" }),
				]),
			);
		});

		it("returns warnings for missing assets on successful creation", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const packageBody: CommandPackageBody = {
				code: "export default async function() { return { ok: true }; }",
				manifest: {
					action: "minimal",
					description: "Minimal command",
					domain: "test",
					id: "test-minimal",
					parameters: [],
					runtime: "node",
				},
			};
			const commandDirPath = await writeCommandDir(homeDir, "minimal-command-dir", packageBody);
			const result = await runSourceCli(
				["command", "create", "test", "minimal", "--from-dir", commandDirPath, "--format", "json"],
				homeDir,
			);
			const payload = parseJsonOutput<CommandCreateResult>(result.stdout);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);
			expect(payload.warnings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ code: "MISSING_README", level: "warning" }),
					expect.objectContaining({ code: "MISSING_CONTEXT", level: "warning" }),
				]),
			);
		});
	});

	describe("user command execution", () => {
		it("executes a created user command through the source CLI", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			// Register the command first so this scenario can focus on runtime output.
			const { createPayload, createResult } = await registerUserCommand(
				homeDir,
				"note-save-package.json",
				notesSavePackage,
			);

			expect(createResult.exitCode).toBe(0);
			expect(createPayload.success).toBe(true);

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
	});

	describe("command validate", () => {
		it("returns success for a valid command directory", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const commandDirPath = await writeCommandDir(homeDir, "validate-ok-dir", notesSavePackage);
			const result = await runSourceCli(
				["command", "validate", "--from-dir", commandDirPath, "--format", "json"],
				homeDir,
			);
			const payload = parseJsonOutput<{ success: boolean; warnings?: Array<{ code: string; level: string }> }>(result.stdout);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);
		});

		it("returns VALIDATION_ERROR for a reserved domain when domain is provided", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const commandDirPath = await writeCommandDir(homeDir, "validate-reserved-dir", reservedSyncPackage);
			const result = await runSourceCli(
				["command", "validate", "--from-dir", commandDirPath, "command", "sync", "--format", "json"],
				homeDir,
			);
			const payload = parseJsonOutput<{ success: boolean; error?: { code: string } }>(result.stdout);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(false);
			expect(payload.error?.code).toBe("RESERVED_DOMAIN");
		});

		it("returns structured errors for validation failures", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const invalidPackage: CommandPackageBody = {
				code: "export default async function() { return e1; }",
				manifest: {
					action: "bad",
					description: "Bad command",
					domain: "bad-domain",
					id: "bad-domain-wrong-id",
					parameters: [],
					runtime: "node",
				},
			};
			const commandDirPath = await writeCommandDir(homeDir, "validate-bad-dir", invalidPackage);
			const result = await runSourceCli(
				["command", "validate", "--from-dir", commandDirPath, "--format", "json"],
				homeDir,
			);
			const payload = parseJsonOutput<{ success: boolean; error?: { code: string; details?: Array<{ code: string; level: string }> } }>(result.stdout);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(false);
			expect(payload.error?.code).toBe("VALIDATION_ERROR");
			expect(payload.error?.details).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ code: "ID_MISMATCH", level: "error" }),
					expect.objectContaining({ code: "TEMP_REF_FOUND", level: "error" }),
				]),
			);
		});
	});

	describe("command remove", () => {
		it("removes user commands from subsequent list output", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createPayload, createResult } = await registerUserCommand(
				homeDir,
				"note-delete-package.json",
				notesDeletePackage,
			);

			expect(createResult.exitCode).toBe(0);
			expect(createPayload.success).toBe(true);

			const removeResult = await runSourceCli(["command", "remove", "notes", "delete", "--format", "json"], homeDir);
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

		it("returns a structured error when removing a built-in command", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const result = await runSourceCli(["command", "remove", "example", "hello", "--format", "json"], homeDir);
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
});
