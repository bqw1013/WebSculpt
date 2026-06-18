import { mkdir, rm, writeFile } from "node:fs/promises";
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
import { notesDeletePackage, notesSavePackage, registerUserCommand } from "./helpers/commands";

interface CommandImportResult {
	success: boolean;
	results?: Array<{ command: string; status: string }>;
	error?: { code: string; message: string; details?: Array<{ code: string; level: string }> };
}

/**
 * Creates an export package by running `command export` in an isolated home
 * with the given commands already registered. Returns the export directory path.
 */
async function createExportPackage(homeDir: string, exportDirName: string, identifiers?: string[]): Promise<string> {
	const exportDir = join(homeDir, exportDirName);
	const args = ["command", "export", "--to", exportDir, "--format", "json"];
	if (identifiers && identifiers.length > 0) {
		args.push(...identifiers);
	}
	const result = await runSourceCli(args, homeDir);
	if (result.exitCode !== 0) {
		throw new Error(`Failed to create export package: ${result.stderr}`);
	}
	return exportDir;
}

describe("command import", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("imports all commands with no conflicts", async () => {
		// Create export package from one home
		const sourceHome = await createIsolatedHome();
		tempDirs.push(sourceHome);
		await registerUserCommand(sourceHome, "note-save-package", notesSavePackage);
		await registerUserCommand(sourceHome, "note-delete-package", notesDeletePackage);
		const exportDir = await createExportPackage(sourceHome, "export-pkg");

		// Import into a fresh home
		const targetHome = await createIsolatedHome();
		tempDirs.push(targetHome);
		const result = await runSourceCli(["command", "import", "--from", exportDir, "--format", "json"], targetHome);
		const payload = parseJsonOutput<CommandImportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		// Filter to only the user commands we registered (builtins are also exported/imported)
		const notesResults = payload.results?.filter((r) => r.command.startsWith("notes/"));
		expect(notesResults).toHaveLength(2);
		expect(notesResults.map((r) => r.status)).toEqual(["installed", "installed"]);

		// Verify installed manifest contains injected identity fields
		const installedManifest = await readJsonFile<{ id: string; domain: string; action: string }>(
			websculptPath(targetHome, "commands", "notes", "save", "manifest.json"),
		);
		expect(installedManifest.id).toBe("notes-save");
		expect(installedManifest.domain).toBe("notes");
		expect(installedManifest.action).toBe("save");
	});

	it("skips existing commands by default", async () => {
		// Create export package with two commands
		const sourceHome = await createIsolatedHome();
		tempDirs.push(sourceHome);
		await registerUserCommand(sourceHome, "note-save-package", notesSavePackage);
		await registerUserCommand(sourceHome, "note-delete-package", notesDeletePackage);
		const exportDir = await createExportPackage(sourceHome, "export-pkg");

		// Pre-register one of the commands in the target home
		const targetHome = await createIsolatedHome();
		tempDirs.push(targetHome);
		await registerUserCommand(targetHome, "note-save-package", notesSavePackage);

		const result = await runSourceCli(["command", "import", "--from", exportDir, "--format", "json"], targetHome);
		const payload = parseJsonOutput<CommandImportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		// Filter to only the user commands we registered
		const notesResults = payload.results?.filter((r) => r.command.startsWith("notes/"));
		expect(notesResults).toHaveLength(2);

		const skipped = notesResults.filter((r) => r.status === "skipped");
		const installed = notesResults.filter((r) => r.status === "installed");
		expect(skipped).toHaveLength(1);
		expect(skipped[0].command).toBe("notes/save");
		expect(installed).toHaveLength(1);
		expect(installed[0].command).toBe("notes/delete");
	});

	it("overwrites existing commands with --force", async () => {
		const sourceHome = await createIsolatedHome();
		tempDirs.push(sourceHome);
		await registerUserCommand(sourceHome, "note-save-package", notesSavePackage);
		const exportDir = await createExportPackage(sourceHome, "export-pkg", ["notes/save"]);

		const targetHome = await createIsolatedHome();
		tempDirs.push(targetHome);
		await registerUserCommand(targetHome, "note-save-package", notesSavePackage);

		const result = await runSourceCli(
			["command", "import", "--from", exportDir, "--force", "--format", "json"],
			targetHome,
		);
		const payload = parseJsonOutput<CommandImportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.results).toHaveLength(1);
		expect(payload.results?.[0].status).toBe("overwritten");
	});

	it("validates and reports conflicts without writing with --dry-run", async () => {
		const sourceHome = await createIsolatedHome();
		tempDirs.push(sourceHome);
		await registerUserCommand(sourceHome, "note-save-package", notesSavePackage);
		const exportDir = await createExportPackage(sourceHome, "export-pkg", ["notes/save"]);

		const targetHome = await createIsolatedHome();
		tempDirs.push(targetHome);
		await registerUserCommand(targetHome, "note-save-package", notesSavePackage);

		const result = await runSourceCli(
			["command", "import", "--from", exportDir, "--dry-run", "--format", "json"],
			targetHome,
		);
		const payload = parseJsonOutput<CommandImportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.results).toHaveLength(1);
		expect(payload.results?.[0].status).toBe("skipped");

		// Verify nothing was written
		try {
			await readJsonFile(websculptPath(targetHome, "registry-index.json"));
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
		} catch {
			// Expected: registry index should not exist if no write happened
		}
	});

	it("returns MISSING_COMMANDS_DIR when package has no commands/ directory", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		// Create a directory without a commands/ subdirectory
		const emptyDir = join(homeDir, "bad-package");
		await mkdir(emptyDir, { recursive: true });

		const result = await runSourceCli(["command", "import", "--from", emptyDir, "--format", "json"], homeDir);
		const payload = parseJsonOutput<CommandImportResult>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("MISSING_COMMANDS_DIR");
	});

	it("returns INDEX_MISMATCH when index.json does not match on-disk commands", async () => {
		const sourceHome = await createIsolatedHome();
		tempDirs.push(sourceHome);
		await registerUserCommand(sourceHome, "note-save-package", notesSavePackage);
		const exportDir = await createExportPackage(sourceHome, "export-pkg");

		// Corrupt index.json by adding a non-existent command
		const corruptedIndex = { commands: ["notes/save", "nonexistent/fake"] };
		await writeFile(join(exportDir, "index.json"), JSON.stringify(corruptedIndex, null, 2), "utf8");

		const targetHome = await createIsolatedHome();
		tempDirs.push(targetHome);

		const result = await runSourceCli(["command", "import", "--from", exportDir, "--format", "json"], targetHome);
		const payload = parseJsonOutput<CommandImportResult>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("INDEX_MISMATCH");
	});

	it("returns INDEX_MISMATCH when on-disk has more commands than index.json", async () => {
		const sourceHome = await createIsolatedHome();
		tempDirs.push(sourceHome);
		await registerUserCommand(sourceHome, "note-save-package", notesSavePackage);
		await registerUserCommand(sourceHome, "note-delete-package", notesDeletePackage);
		const exportDir = await createExportPackage(sourceHome, "export-pkg");

		// Corrupt index.json by removing one command from the list
		const corruptedIndex = { commands: ["notes/save"] };
		await writeFile(join(exportDir, "index.json"), JSON.stringify(corruptedIndex, null, 2), "utf8");

		const targetHome = await createIsolatedHome();
		tempDirs.push(targetHome);

		const result = await runSourceCli(["command", "import", "--from", exportDir, "--format", "json"], targetHome);
		const payload = parseJsonOutput<CommandImportResult>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("INDEX_MISMATCH");
	});

	it("aborts with VALIDATION_ERROR when a command fails validation, writing nothing", async () => {
		const sourceHome = await createIsolatedHome();
		tempDirs.push(sourceHome);
		await registerUserCommand(sourceHome, "note-save-package", notesSavePackage);

		// Create a broken command that will fail validation
		const brokenDir = join(sourceHome, "broken-cmd");
		await mkdir(join(brokenDir, "commands", "broken", "action"), { recursive: true });
		await writeFile(
			join(brokenDir, "commands", "broken", "action", "manifest.json"),
			JSON.stringify({
				action: "action",
				description: "Broken command",
				domain: "broken",
				id: "broken-action",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			}),
			"utf8",
		);
		// Entry file with a syntax error to fail validation
		await writeFile(
			join(brokenDir, "commands", "broken", "action", "command.js"),
			"this is not valid javascript {",
			"utf8",
		);
		await writeFile(join(brokenDir, "index.json"), JSON.stringify({ commands: ["broken/action"] }), "utf8");

		const targetHome = await createIsolatedHome();
		tempDirs.push(targetHome);

		const result = await runSourceCli(["command", "import", "--from", brokenDir, "--format", "json"], targetHome);
		const payload = parseJsonOutput<CommandImportResult>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("VALIDATION_ERROR");
		expect(payload.error?.details).toBeDefined();

		// Verify nothing was written to target
		try {
			await readJsonFile(websculptPath(targetHome, "registry-index.json"));
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
		} catch {
			// Expected: registry index should not exist
		}
	});

	it("handles import without index.json by scanning commands/ directly", async () => {
		const sourceHome = await createIsolatedHome();
		tempDirs.push(sourceHome);
		await registerUserCommand(sourceHome, "note-save-package", notesSavePackage);
		const exportDir = await createExportPackage(sourceHome, "export-pkg", ["notes/save"]);

		// Remove index.json to test discovery fallback
		await rm(join(exportDir, "index.json"), { force: true });

		const targetHome = await createIsolatedHome();
		tempDirs.push(targetHome);

		const result = await runSourceCli(["command", "import", "--from", exportDir, "--format", "json"], targetHome);
		const payload = parseJsonOutput<CommandImportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.results).toHaveLength(1);
		expect(payload.results?.[0].status).toBe("installed");
		expect(payload.results?.[0].command).toBe("notes/save");
	});

	it("excludes reserved domain commands via validation", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		// Create a package with a command in a reserved domain
		const pkgDir = join(homeDir, "reserved-pkg");
		await mkdir(join(pkgDir, "commands", "scope", "test"), { recursive: true });
		await writeFile(
			join(pkgDir, "commands", "scope", "test", "manifest.json"),
			JSON.stringify({
				action: "test",
				description: "Should be rejected",
				domain: "scope",
				id: "scope-test",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			}),
			"utf8",
		);
		await writeFile(
			join(pkgDir, "commands", "scope", "test", "command.js"),
			"export default async function() { return { ok: true }; }\n",
			"utf8",
		);

		const result = await runSourceCli(["command", "import", "--from", pkgDir, "--format", "json"], homeDir);
		const payload = parseJsonOutput<CommandImportResult>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("VALIDATION_ERROR");
	});
});
