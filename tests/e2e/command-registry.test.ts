import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createIsolatedHome,
	parseJsonOutput,
	readJsonFile,
	removeTempDir,
	runSourceCli,
	websculptPath,
} from "./helpers/cli";
import {
	type CommandRemoveResult,
	notesDeletePackage,
	notesSavePackage,
	type RegistryIndex,
	registerUserCommand,
} from "./helpers/commands";

describe("command registry", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	describe("command show", () => {
		it("returns contract card with readmeContent in json mode when --include-readme is used", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createPayload } = await registerUserCommand(homeDir, "show-readme-package", notesSavePackage);
			expect(createPayload.success).toBe(true);

			const commandDir = websculptPath(homeDir, "commands", "notes", "save");
			await writeFile(join(commandDir, "README.md"), "# Notes Save\nSave a note.", "utf8");

			const result = await runSourceCli(
				["command", "show", "notes", "save", "--format", "json", "--include-readme"],
				homeDir,
			);
			const payload = parseJsonOutput<{ success: boolean; command: unknown; readmeContent?: string }>(result.stdout);
			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);
			expect(payload.readmeContent).toBe("# Notes Save\nSave a note.");
		});

		it("returns contract card without readmeContent when README is missing", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createPayload } = await registerUserCommand(homeDir, "show-no-readme-package", notesDeletePackage);
			expect(createPayload.success).toBe(true);

			const result = await runSourceCli(
				["command", "show", "notes", "delete", "--format", "json", "--include-readme"],
				homeDir,
			);
			const payload = parseJsonOutput<{ success: boolean; command: unknown; readmeContent?: string }>(result.stdout);
			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);
			expect(payload.readmeContent).toBeUndefined();
		});

		it("appends README content in human mode when --include-readme is used", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createPayload } = await registerUserCommand(homeDir, "show-human-readme-package", notesSavePackage);
			expect(createPayload.success).toBe(true);

			const commandDir = websculptPath(homeDir, "commands", "notes", "save");
			await writeFile(join(commandDir, "README.md"), "# Human README\nUsage: --title <text>", "utf8");

			const result = await runSourceCli(["command", "show", "notes", "save", "--include-readme"], homeDir);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("notes");
			expect(result.stdout).toContain("--- README ---");
			expect(result.stdout).toContain("# Human README");
			expect(result.stdout).toContain("Usage: --title <text>");
		});
	});

	describe("command list", () => {
		it("shows built-in commands in a fresh environment", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const result = await runSourceCli(["command", "list"], homeDir);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain("builtin");
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
				code: "export default async function(params) { return { value: params.mode }; }\n",
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
	});

	describe("registry index", () => {
		it("generates the index on first CLI invocation", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const result = await runSourceCli(["command", "list"], homeDir);
			expect(result.exitCode).toBe(0);

			const index = await readJsonFile<RegistryIndex>(websculptPath(homeDir, "registry-index.json"));
			expect(index.formatVersion).toBe(1);
			expect(index.appVersion).toMatch(/^\d+\.\d+\.\d+/);
			expect(index.generatedAt).toBeTruthy();
			expect(index.commands.length).toBeGreaterThan(0);
			expect(index.commands.some((c) => c.source === "builtin")).toBe(true);
		});

		it("reuses an existing valid index on subsequent invocations", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			await runSourceCli(["command", "list"], homeDir);
			const firstIndex = await readJsonFile<RegistryIndex>(websculptPath(homeDir, "registry-index.json"));

			await runSourceCli(["command", "list"], homeDir);
			const secondIndex = await readJsonFile<RegistryIndex>(websculptPath(homeDir, "registry-index.json"));

			expect(secondIndex.generatedAt).toBe(firstIndex.generatedAt);
			expect(secondIndex.commands.length).toBe(firstIndex.commands.length);
		});

		it("rebuilds the index after command create", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			await runSourceCli(["command", "list"], homeDir);
			const beforeIndex = await readJsonFile<RegistryIndex>(websculptPath(homeDir, "registry-index.json"));

			const { createResult } = await registerUserCommand(homeDir, "note-save-package", notesSavePackage);
			expect(createResult.exitCode).toBe(0);

			const afterIndex = await readJsonFile<RegistryIndex>(websculptPath(homeDir, "registry-index.json"));
			expect(afterIndex.generatedAt).not.toBe(beforeIndex.generatedAt);
			expect(afterIndex.commands.some((c) => c.manifest.domain === "notes" && c.manifest.action === "save")).toBe(
				true,
			);
		});

		it("rebuilds the index after command remove", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createResult } = await registerUserCommand(homeDir, "note-delete-package", notesDeletePackage);
			expect(createResult.exitCode).toBe(0);

			await runSourceCli(["command", "list"], homeDir);
			const beforeIndex = await readJsonFile<RegistryIndex>(websculptPath(homeDir, "registry-index.json"));
			expect(beforeIndex.commands.some((c) => c.manifest.domain === "notes" && c.manifest.action === "delete")).toBe(
				true,
			);

			await runSourceCli(["command", "remove", "notes", "delete"], homeDir);
			const afterIndex = await readJsonFile<RegistryIndex>(websculptPath(homeDir, "registry-index.json"));
			expect(afterIndex.generatedAt).not.toBe(beforeIndex.generatedAt);
			expect(afterIndex.commands.some((c) => c.manifest.domain === "notes" && c.manifest.action === "delete")).toBe(
				false,
			);
		});

		it("recovers a corrupted index by full rescan", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			await runSourceCli(["command", "list"], homeDir);
			const indexPath = websculptPath(homeDir, "registry-index.json");
			await writeFile(indexPath, "not-json-at-all", "utf8");

			const result = await runSourceCli(["command", "list"], homeDir);
			expect(result.exitCode).toBe(0);

			const index = await readJsonFile<RegistryIndex>(indexPath);
			expect(index.formatVersion).toBe(1);
			expect(index.commands.length).toBeGreaterThan(0);
		});

		it("evicts manually deleted user commands from list", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createResult } = await registerUserCommand(homeDir, "note-delete-package", notesDeletePackage);
			expect(createResult.exitCode).toBe(0);

			// Populate the index cache.
			const listBefore = await runSourceCli(["command", "list"], homeDir);
			expect(listBefore.exitCode).toBe(0);
			expect(listBefore.stdout).toContain("notes");
			expect(listBefore.stdout).toContain("delete");

			// Manually delete the command directory behind the CLI's back.
			const actionDir = websculptPath(homeDir, "commands", "notes", "delete");
			await rm(actionDir, { recursive: true, force: true });

			const listAfter = await runSourceCli(["command", "list"], homeDir);
			expect(listAfter.exitCode).toBe(0);
			expect(listAfter.stdout).not.toContain("notes");
			expect(listAfter.stdout).not.toContain("delete");
		});

		it("returns NOT_FOUND when removing a manually deleted user command", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createResult } = await registerUserCommand(homeDir, "note-delete-package", notesDeletePackage);
			expect(createResult.exitCode).toBe(0);

			// Populate the index cache.
			await runSourceCli(["command", "list"], homeDir);

			// Manually delete the command directory.
			const actionDir = websculptPath(homeDir, "commands", "notes", "delete");
			await rm(actionDir, { recursive: true, force: true });

			const removeResult = await runSourceCli(["command", "remove", "notes", "delete", "--format", "json"], homeDir);
			const removePayload = parseJsonOutput<CommandRemoveResult>(removeResult.stdout);

			expect(removeResult.exitCode).toBe(0);
			expect(removePayload.success).toBe(false);
			expect(removePayload.error).toEqual(
				expect.objectContaining({
					code: "NOT_FOUND",
				}),
			);
		});

		it("rebuilds the index when appVersion is stale", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			await runSourceCli(["command", "list"], homeDir);
			const indexPath = websculptPath(homeDir, "registry-index.json");
			const beforeIndex = await readJsonFile<RegistryIndex>(indexPath);
			beforeIndex.appVersion = "0.0.0-stale";
			await writeFile(indexPath, JSON.stringify(beforeIndex), "utf8");

			const result = await runSourceCli(["command", "list"], homeDir);
			expect(result.exitCode).toBe(0);

			const afterIndex = await readJsonFile<RegistryIndex>(indexPath);
			expect(afterIndex.appVersion).not.toBe("0.0.0-stale");
			expect(afterIndex.generatedAt).not.toBe(beforeIndex.generatedAt);
		});
	});
});
