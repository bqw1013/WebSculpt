import { mkdir, writeFile } from "node:fs/promises";
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
import { type CommandCreateResult, notesSavePackage, registerUserCommand, writeCommandDir } from "./helpers/commands";

describe("command create", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("registers a user command from a valid source directory", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const { createPayload, createResult } = await registerUserCommand(homeDir, "note-save-package", notesSavePackage);

		expect(createResult.exitCode).toBe(0);
		expect(createPayload).toEqual(
			expect.objectContaining({
				command: "notes/save",
				success: true,
			}),
		);
		expect(createPayload.path).toBe(websculptPath(homeDir, "commands", "notes", "save"));
	});

	it("overwrites an existing command when --force is used", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const { createPayload: firstPayload, createResult: firstResult } = await registerUserCommand(
			homeDir,
			"note-save-package",
			notesSavePackage,
		);

		expect(firstResult.exitCode).toBe(0);
		expect(firstPayload.success).toBe(true);

		const commandDirPath = await writeCommandDir(homeDir, "note-save-package-v2", notesSavePackage);
		const overwriteResult = await runSourceCli(
			["command", "create", "notes", "save", "--from-dir", commandDirPath, "--force", "--format", "json"],
			homeDir,
		);
		const overwritePayload = parseJsonOutput<CommandCreateResult>(overwriteResult.stdout);

		expect(overwriteResult.exitCode).toBe(0);
		expect(overwritePayload.success).toBe(true);
		expect(overwritePayload.command).toBe("notes/save");
	});

	it("fails with ALREADY_EXISTS when the command already exists and --force is omitted", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const { createResult: firstResult } = await registerUserCommand(homeDir, "note-save-package", notesSavePackage);

		expect(firstResult.exitCode).toBe(0);

		const commandDirPath = await writeCommandDir(homeDir, "note-save-package-v2", notesSavePackage);
		const result = await runSourceCli(
			["command", "create", "notes", "save", "--from-dir", commandDirPath, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<CommandCreateResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error).toEqual(
			expect.objectContaining({
				code: "ALREADY_EXISTS",
			}),
		);
	});

	it("returns INVALID_PACKAGE when manifest.json is missing", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const emptyDir = join(homeDir, "empty-dir");
		await mkdir(emptyDir, { recursive: true });

		const result = await runSourceCli(
			["command", "create", "test", "missing", "--from-dir", emptyDir, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<CommandCreateResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error).toEqual(
			expect.objectContaining({
				code: "INVALID_PACKAGE",
			}),
		);
	});

	it("returns INVALID_PACKAGE when manifest.json contains invalid JSON", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const badDir = join(homeDir, "bad-json-dir");
		await mkdir(badDir, { recursive: true });
		await writeFile(join(badDir, "manifest.json"), "{ not json", "utf8");
		await writeFile(join(badDir, "command.js"), "export default async function() {}", "utf8");

		const result = await runSourceCli(
			["command", "create", "test", "badjson", "--from-dir", badDir, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<CommandCreateResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error).toEqual(
			expect.objectContaining({
				code: "INVALID_PACKAGE",
			}),
		);
	});

	it("returns INVALID_PACKAGE when the entry file is missing", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const noEntryDir = join(homeDir, "no-entry-dir");
		await mkdir(noEntryDir, { recursive: true });
		await writeFile(
			join(noEntryDir, "manifest.json"),
			JSON.stringify({
				action: "noentry",
				description: "Missing entry",
				domain: "test",
				id: "test-noentry",
				runtime: "node",
				requiresBrowser: false,
			}),
			"utf8",
		);

		const result = await runSourceCli(
			["command", "create", "test", "noentry", "--from-dir", noEntryDir, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<CommandCreateResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error).toEqual(
			expect.objectContaining({
				code: "INVALID_PACKAGE",
			}),
		);
	});

	it("succeeds without warnings when README.md and context.md are present", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const packageBody = {
			code: "export default async function() { return { ok: true }; }\n",
			manifest: {
				action: "complete",
				description: "Fully documented command",
				domain: "test",
				id: "test-complete",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			},
		};
		const commandDirPath = await writeCommandDir(homeDir, "complete-package", packageBody);
		await writeFile(
			join(commandDirPath, "README.md"),
			"# Complete Command\n\n## Description\n\n## Parameters\n\n## Return Value\n\n## Usage\n\n## Common Error Codes\n",
			"utf8",
		);
		await writeFile(
			join(commandDirPath, "context.md"),
			"## Precipitation Background\n\n## Page Structure\n\n## Environment Dependencies\n\n## Failure Signals\n\n## Repair Clues\n",
			"utf8",
		);

		const result = await runSourceCli(
			["command", "create", "test", "complete", "--from-dir", commandDirPath, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<CommandCreateResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.warnings).toBeUndefined();
	});

	it("injects missing id, domain, action, and default runtime into the installed manifest", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const minimalPackage = {
			code: "export default async function() { return { ok: true }; }\n",
			manifest: {
				description: "Minimal command",
				parameters: [],
				requiresBrowser: false,
			},
		};
		const commandDirPath = await writeCommandDir(
			homeDir,
			"minimal-package",
			minimalPackage as unknown as Parameters<typeof writeCommandDir>[2],
		);
		const result = await runSourceCli(
			["command", "create", "minimal", "cmd", "--from-dir", commandDirPath, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<CommandCreateResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);

		const installedManifest = await readJsonFile<{ id: string; domain: string; action: string; runtime: string }>(
			join(homeDir, ".websculpt", "commands", "minimal", "cmd", "manifest.json"),
		);

		expect(installedManifest.id).toBe("minimal-cmd");
		expect(installedManifest.domain).toBe("minimal");
		expect(installedManifest.action).toBe("cmd");
		expect(installedManifest.runtime).toBe("node");
	});

	it("rejects reserved domain 'config' with RESERVED_DOMAIN", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const configPackage = {
			code: "export default async function() { return { ok: true }; }\n",
			manifest: {
				action: "sync",
				description: "Should not be created",
				domain: "config",
				id: "config-sync",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			},
		};
		const commandDirPath = await writeCommandDir(homeDir, "config-dir", configPackage);
		const result = await runSourceCli(
			["command", "create", "config", "sync", "--from-dir", commandDirPath, "--format", "json"],
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
});
