import { afterEach, describe, expect, it } from "vitest";
import {
	CommandCreateResult,
	CommandRemoveResult,
	notesDeletePackage,
	notesSavePackage,
	registerUserCommand,
	RegistryIndex,
	writeCommandDir,
} from "./helpers/commands";
import { createIsolatedHome, parseJsonOutput, readJsonFile, removeTempDir, runSourceCli, websculptPath } from "./helpers/cli";
import { writeFile } from "node:fs/promises";

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

		it("allows a user command to override a built-in without crashing command list", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const overridePackage = {
				code: 'export default async function() { return { source: "user" }; }\n',
				manifest: {
					action: "hello",
					description: "User override of example hello",
					domain: "example",
					id: "example-hello",
					parameters: [],
					runtime: "node",
				},
			};
			const commandDirPath = await writeCommandDir(homeDir, "override-example-hello", overridePackage);
			const createResult = await runSourceCli(
				["command", "create", "example", "hello", "--from-dir", commandDirPath, "--force", "--format", "json"],
				homeDir,
			);
			const createPayload = parseJsonOutput<CommandCreateResult>(createResult.stdout);

			expect(createResult.exitCode).toBe(0);
			expect(createPayload.success).toBe(true);

			const listResult = await runSourceCli(["command", "list"], homeDir);

			expect(listResult.exitCode).toBe(0);
			expect(listResult.stdout).toContain("example");
			expect(listResult.stdout).toContain("hello");
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
			expect(afterIndex.commands.some((c) => c.manifest.domain === "notes" && c.manifest.action === "save")).toBe(true);
		});

		it("rebuilds the index after command remove", async () => {
			const homeDir = await createIsolatedHome();
			tempDirs.push(homeDir);

			const { createResult } = await registerUserCommand(homeDir, "note-delete-package", notesDeletePackage);
			expect(createResult.exitCode).toBe(0);

			await runSourceCli(["command", "list"], homeDir);
			const beforeIndex = await readJsonFile<RegistryIndex>(websculptPath(homeDir, "registry-index.json"));
			expect(beforeIndex.commands.some((c) => c.manifest.domain === "notes" && c.manifest.action === "delete")).toBe(true);

			await runSourceCli(["command", "remove", "notes", "delete"], homeDir);
			const afterIndex = await readJsonFile<RegistryIndex>(websculptPath(homeDir, "registry-index.json"));
			expect(afterIndex.generatedAt).not.toBe(beforeIndex.generatedAt);
			expect(afterIndex.commands.some((c) => c.manifest.domain === "notes" && c.manifest.action === "delete")).toBe(false);
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
