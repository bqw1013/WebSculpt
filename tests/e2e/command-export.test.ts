import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedHome, parseJsonOutput, readJsonFile, removeTempDir, runSourceCli } from "./helpers/cli";
import { notesDeletePackage, notesSavePackage, registerUserCommand } from "./helpers/commands";

interface CommandExportResult {
	success: boolean;
	exported?: string[];
	to?: string;
	warnings?: Array<{ code: string; level: string; message: string }>;
	error?: { code: string; message: string };
}

describe("command export", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("exports all resolved commands", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		// Register two commands in different domains
		await registerUserCommand(homeDir, "note-save-package", notesSavePackage);
		await registerUserCommand(homeDir, "note-delete-package", notesDeletePackage);

		const exportDir = join(homeDir, "export-out");
		const result = await runSourceCli(["command", "export", "--to", exportDir, "--format", "json"], homeDir);
		const payload = parseJsonOutput<CommandExportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		// Filter for only the user commands we registered (builtins are also exported)
		const notesExported = payload.exported?.filter((c) => c.startsWith("notes/"));
		expect(notesExported).toHaveLength(2);
		expect(notesExported).toContain("notes/save");
		expect(notesExported).toContain("notes/delete");

		// Verify index.json structure
		const index = await readJsonFile<{ commands: string[] }>(join(exportDir, "index.json"));
		expect(index.commands.length).toBeGreaterThanOrEqual(2);

		// Verify notes command directories exist
		await readJsonFile(join(exportDir, "commands", "notes", "save", "manifest.json"));
		await readJsonFile(join(exportDir, "commands", "notes", "delete", "manifest.json"));

		// Verify command directories exist
		await readJsonFile(join(exportDir, "commands", "notes", "save", "manifest.json"));
		await readJsonFile(join(exportDir, "commands", "notes", "delete", "manifest.json"));
	});

	it("exports a single domain", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		await registerUserCommand(homeDir, "note-save-package", notesSavePackage);
		await registerUserCommand(homeDir, "note-delete-package", notesDeletePackage);

		const exportDir = join(homeDir, "export-out");
		const result = await runSourceCli(["command", "export", "notes", "--to", exportDir, "--format", "json"], homeDir);
		const payload = parseJsonOutput<CommandExportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.exported).toHaveLength(2);
		expect(payload.exported).toContain("notes/save");
		expect(payload.exported).toContain("notes/delete");
	});

	it("exports a single command by domain/action", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		await registerUserCommand(homeDir, "note-save-package", notesSavePackage);
		await registerUserCommand(homeDir, "note-delete-package", notesDeletePackage);

		const exportDir = join(homeDir, "export-out");
		const result = await runSourceCli(
			["command", "export", "notes/save", "--to", exportDir, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<CommandExportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.exported).toEqual(["notes/save"]);
	});

	it("returns NO_COMMANDS_MATCHED when no commands match the identifiers", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		await registerUserCommand(homeDir, "note-save-package", notesSavePackage);

		const exportDir = join(homeDir, "export-out");
		const result = await runSourceCli(
			["command", "export", "nonexistent/action", "--to", exportDir, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<CommandExportResult>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("NO_COMMANDS_MATCHED");
	});

	it("rejects non-empty target directory without --force", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		await registerUserCommand(homeDir, "note-save-package", notesSavePackage);

		// Create a non-empty directory
		const exportDir = join(homeDir, "export-out");
		await mkdir(exportDir, { recursive: true });
		await writeFile(join(exportDir, "existing-file.txt"), "content", "utf8");

		const result = await runSourceCli(["command", "export", "--to", exportDir, "--format", "json"], homeDir);
		const payload = parseJsonOutput<CommandExportResult>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("DIRECTORY_NOT_EMPTY");
	});

	it("overwrites non-empty target with --force", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		await registerUserCommand(homeDir, "note-save-package", notesSavePackage);

		const exportDir = join(homeDir, "export-out");
		await mkdir(exportDir, { recursive: true });
		await writeFile(join(exportDir, "existing-file.txt"), "content", "utf8");

		const result = await runSourceCli(
			["command", "export", "--to", exportDir, "--force", "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<CommandExportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.exported?.length).toBeGreaterThanOrEqual(1);
		expect(payload.exported).toContain("notes/save");
	});

	it("includes EVIDENCE_INCLUDED warning when any command has evidence.md", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		// Register a command, then manually add evidence.md to its directory
		const { createPayload } = await registerUserCommand(homeDir, "note-save-package", notesSavePackage);
		const evidencePath = join(createPayload.path ?? "", "evidence.md");
		await writeFile(evidencePath, "Evidence content for testing", "utf8");

		const exportDir = join(homeDir, "export-out");
		const result = await runSourceCli(["command", "export", "--to", exportDir, "--format", "json"], homeDir);
		const payload = parseJsonOutput<CommandExportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.warnings).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "EVIDENCE_INCLUDED", level: "warning" })]),
		);
	});

	it("exports multiple identifiers as union of matches", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		await registerUserCommand(homeDir, "note-save-package", notesSavePackage);
		await registerUserCommand(homeDir, "note-delete-package", notesDeletePackage);

		const exportDir = join(homeDir, "export-out");
		const result = await runSourceCli(
			["command", "export", "notes/save", "notes/delete", "--to", exportDir, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<CommandExportResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.exported).toHaveLength(2);
		expect(payload.exported).toContain("notes/save");
		expect(payload.exported).toContain("notes/delete");
	});
});
