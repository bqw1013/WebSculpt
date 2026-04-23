import { afterEach, describe, expect, it } from "vitest";
import {
	CommandCreateResult,
	CommandRemoveResult,
	notesDeletePackage,
	notesSavePackage,
	registerUserCommand,
	writeCommandDir,
} from "./helpers/commands";
import { createIsolatedHome, parseJsonOutput, removeTempDir, runSourceCli } from "./helpers/cli";

describe("command registry", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	describe("command list", () => {
		it("shows built-in commands in a fresh environment", async () => {
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
				"note-save-package",
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

	describe("user command execution", () => {
		it("executes a created user command with passed parameters", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createPayload, createResult } = await registerUserCommand(
				homeDir,
				"note-save-package",
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

		it("uses the default value when an optional parameter is omitted", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const packageWithDefault = {
				code: 'export default async function(params) { return { value: params.mode }; }\n',
				manifest: {
					action: "defaulttest",
					description: "Test default parameter",
					domain: "test",
					id: "test-defaulttest",
					parameters: [{ name: "mode", description: "Mode", default: "auto" }],
					runtime: "node",
				},
			};
			const { createPayload, createResult } = await registerUserCommand(
				homeDir,
				"default-test-package",
				packageWithDefault,
			);

			expect(createResult.exitCode).toBe(0);
			expect(createPayload.success).toBe(true);

			const runResult = await runSourceCli(["test", "defaulttest"], homeDir);
			const runPayload = parseJsonOutput<{
				command: string;
				data: { value: string };
				success: boolean;
			}>(runResult.stdout);

			expect(runResult.exitCode).toBe(0);
			expect(runPayload.success).toBe(true);
			expect(runPayload.data.value).toBe("auto");
		});
	});

	describe("command remove", () => {
		it("deletes a user command and it disappears from list", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createPayload, createResult } = await registerUserCommand(
				homeDir,
				"note-delete-package",
				notesDeletePackage,
			);

			expect(createResult.exitCode).toBe(0);
			expect(createPayload.success).toBe(true);

			const removeResult = await runSourceCli(
				["command", "remove", "notes", "delete", "--format", "json"],
				homeDir,
			);
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

		it("returns a structured error when trying to remove a built-in command", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const result = await runSourceCli(
				["command", "remove", "example", "hello", "--format", "json"],
				homeDir,
			);
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
