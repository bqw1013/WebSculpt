import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedHome, parseJsonOutput, removeTempDir, runSourceCli } from "./helpers/cli";
import { notesDeletePackage, notesSavePackage, registerUserCommand } from "./helpers/commands";

describe("scope", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	describe("scope init", () => {
		it("creates scope.json with empty commands array", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			const result = await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });
			expect(result.exitCode).toBe(0);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			const scope = JSON.parse(await readFile(scopePath, "utf8"));
			expect(scope).toEqual({ commands: [] });
		});

		it("errors with SCOPE_ALREADY_EXISTS when scope already exists", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });
			const result = await runSourceCli(["scope", "init", "--format", "json"], homeDir, { cwd: workDir });
			const payload = parseJsonOutput<{ success: boolean; error?: { code: string } }>(result.stdout);

			expect(result.exitCode).toBe(1);
			expect(payload.success).toBe(false);
			expect(payload.error?.code).toBe("SCOPE_ALREADY_EXISTS");
		});
	});

	describe("scope destroy", () => {
		it("removes scope.json and restores full visibility", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });
			const destroyResult = await runSourceCli(["scope", "destroy"], homeDir, { cwd: workDir });
			expect(destroyResult.exitCode).toBe(0);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			await expect(readFile(scopePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

			const listResult = await runSourceCli(["command", "list"], homeDir, { cwd: workDir });
			expect(listResult.exitCode).toBe(0);
			expect(listResult.stdout).toContain("builtin");
		});

		it("errors with NO_SCOPE_FOUND when no scope exists", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			const result = await runSourceCli(["scope", "destroy", "--format", "json"], homeDir, { cwd: workDir });
			const payload = parseJsonOutput<{ success: boolean; error?: { code: string } }>(result.stdout);

			expect(result.exitCode).toBe(1);
			expect(payload.success).toBe(false);
			expect(payload.error?.code).toBe("NO_SCOPE_FOUND");
		});
	});

	describe("scope show", () => {
		it("displays valid commands and marks missing ones", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			const { createPayload } = await registerUserCommand(homeDir, "notes-save", notesSavePackage);
			expect(createPayload.success).toBe(true);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			await mkdir(join(workDir, ".websculpt"), { recursive: true });
			await writeFile(scopePath, JSON.stringify({ commands: ["notes/save", "notes/missing"] }), "utf8");

			const result = await runSourceCli(["scope", "show", "--format", "json"], homeDir, { cwd: workDir });
			const payload = parseJsonOutput<{
				success: boolean;
				scopeCommands?: Array<{ command: string; valid: boolean }>;
			}>(result.stdout);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);
			expect(payload.scopeCommands).toEqual([
				{ command: "notes/save", valid: true },
				{ command: "notes/missing", valid: false },
			]);
		});

		it("indicates no scope when none exists", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			const result = await runSourceCli(["scope", "show"], homeDir, { cwd: workDir });
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("No scope configured");
		});
	});

	describe("scope add", () => {
		it("snapshots all domain commands when adding a domain", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await registerUserCommand(homeDir, "notes-save", notesSavePackage);
			await registerUserCommand(homeDir, "notes-delete", notesDeletePackage);

			await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });
			const result = await runSourceCli(["scope", "add", "notes", "--format", "json"], homeDir, { cwd: workDir });
			const payload = parseJsonOutput<{ success: boolean; message?: string }>(result.stdout);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			const scope = JSON.parse(await readFile(scopePath, "utf8"));
			expect(scope.commands).toContain("notes/save");
			expect(scope.commands).toContain("notes/delete");
		});

		it("adds a single command identifier", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });
			const result = await runSourceCli(["scope", "add", "notes/save", "--format", "json"], homeDir, {
				cwd: workDir,
			});
			const payload = parseJsonOutput<{ success: boolean }>(result.stdout);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			const scope = JSON.parse(await readFile(scopePath, "utf8"));
			expect(scope.commands).toEqual(["notes/save"]);
		});

		it("is idempotent when adding an existing command", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });
			await runSourceCli(["scope", "add", "notes/save"], homeDir, { cwd: workDir });
			await runSourceCli(["scope", "add", "notes/save"], homeDir, { cwd: workDir });

			const scopePath = join(workDir, ".websculpt", "scope.json");
			const scope = JSON.parse(await readFile(scopePath, "utf8"));
			expect(scope.commands).toEqual(["notes/save"]);
		});
	});

	describe("scope remove", () => {
		it("removes a single command identifier", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });
			await runSourceCli(["scope", "add", "notes/save"], homeDir, { cwd: workDir });
			await runSourceCli(["scope", "add", "notes/delete"], homeDir, { cwd: workDir });

			const result = await runSourceCli(["scope", "remove", "notes/save", "--format", "json"], homeDir, {
				cwd: workDir,
			});
			const payload = parseJsonOutput<{ success: boolean }>(result.stdout);
			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			const scope = JSON.parse(await readFile(scopePath, "utf8"));
			expect(scope.commands).toEqual(["notes/delete"]);
		});

		it("removes all commands in a domain", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });
			await runSourceCli(["scope", "add", "notes/save"], homeDir, { cwd: workDir });
			await runSourceCli(["scope", "add", "notes/delete"], homeDir, { cwd: workDir });
			await runSourceCli(["scope", "add", "shop/check"], homeDir, { cwd: workDir });

			const result = await runSourceCli(["scope", "remove", "notes", "--format", "json"], homeDir, { cwd: workDir });
			const payload = parseJsonOutput<{ success: boolean }>(result.stdout);
			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			const scope = JSON.parse(await readFile(scopePath, "utf8"));
			expect(scope.commands).toEqual(["shop/check"]);
		});

		it("is idempotent when removing a non-existent command", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });
			await runSourceCli(["scope", "add", "notes/save"], homeDir, { cwd: workDir });

			const result = await runSourceCli(["scope", "remove", "notes/missing", "--format", "json"], homeDir, {
				cwd: workDir,
			});
			const payload = parseJsonOutput<{ success: boolean }>(result.stdout);
			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			const scope = JSON.parse(await readFile(scopePath, "utf8"));
			expect(scope.commands).toEqual(["notes/save"]);
		});
	});

	describe("command list with scope", () => {
		it("filters by scope in current directory", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await registerUserCommand(homeDir, "notes-save", notesSavePackage);
			await registerUserCommand(homeDir, "notes-delete", notesDeletePackage);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			await mkdir(join(workDir, ".websculpt"), { recursive: true });
			await writeFile(scopePath, JSON.stringify({ commands: ["notes/save"] }), "utf8");

			const result = await runSourceCli(["command", "list", "--format", "json"], homeDir, { cwd: workDir });
			const payload = parseJsonOutput<{ success: boolean; commands: Array<{ domain: string; action: string }> }>(
				result.stdout,
			);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);
			expect(payload.commands.map((c) => `${c.domain}/${c.action}`)).toContain("notes/save");
			expect(payload.commands.map((c) => `${c.domain}/${c.action}`)).not.toContain("notes/delete");
		});

		it("uses parent scope from subdirectory", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await registerUserCommand(homeDir, "notes-save", notesSavePackage);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			await mkdir(join(workDir, ".websculpt"), { recursive: true });
			await writeFile(scopePath, JSON.stringify({ commands: ["notes/save"] }), "utf8");

			const subDir = join(workDir, "src");
			await mkdir(subDir, { recursive: true });

			const result = await runSourceCli(["command", "list", "--format", "json"], homeDir, { cwd: subDir });
			const payload = parseJsonOutput<{ success: boolean; commands: Array<{ domain: string; action: string }> }>(
				result.stdout,
			);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);
			expect(payload.commands.map((c) => `${c.domain}/${c.action}`)).toContain("notes/save");
		});

		it("bypasses scope filtering with --all", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await registerUserCommand(homeDir, "notes-save", notesSavePackage);
			await registerUserCommand(homeDir, "notes-delete", notesDeletePackage);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			await mkdir(join(workDir, ".websculpt"), { recursive: true });
			await writeFile(scopePath, JSON.stringify({ commands: ["notes/save"] }), "utf8");

			const result = await runSourceCli(["command", "list", "--all", "--format", "json"], homeDir, { cwd: workDir });
			const payload = parseJsonOutput<{ success: boolean; commands: Array<{ domain: string; action: string }> }>(
				result.stdout,
			);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);
			expect(payload.commands.map((c) => `${c.domain}/${c.action}`)).toContain("notes/save");
			expect(payload.commands.map((c) => `${c.domain}/${c.action}`)).toContain("notes/delete");
		});

		it("shows no commands when scope is empty", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await registerUserCommand(homeDir, "notes-save", notesSavePackage);

			await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });

			const result = await runSourceCli(["command", "list", "--format", "json"], homeDir, { cwd: workDir });
			const payload = parseJsonOutput<{ success: boolean; commands: Array<unknown> }>(result.stdout);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);
			expect(payload.commands).toHaveLength(0);
		});

		it("filters builtin commands too", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			// First, discover what builtin commands exist.
			const allResult = await runSourceCli(["command", "list", "--format", "json"], homeDir, { cwd: workDir });
			const allPayload = parseJsonOutput<{
				success: boolean;
				commands: Array<{ domain: string; action: string; type: string }>;
			}>(allResult.stdout);
			const builtins = allPayload.commands.filter((c) => c.type === "builtin");
			expect(builtins.length).toBeGreaterThan(0);

			// Create a scope that whitelists exactly one builtin command.
			const target = builtins[0];
			const scopePath = join(workDir, ".websculpt", "scope.json");
			await mkdir(join(workDir, ".websculpt"), { recursive: true });
			await writeFile(scopePath, JSON.stringify({ commands: [`${target.domain}/${target.action}`] }), "utf8");

			const result = await runSourceCli(["command", "list", "--format", "json"], homeDir, { cwd: workDir });
			const payload = parseJsonOutput<{
				success: boolean;
				commands: Array<{ domain: string; action: string; type: string }>;
			}>(result.stdout);

			expect(result.exitCode).toBe(0);
			expect(payload.success).toBe(true);
			expect(payload.commands).toHaveLength(1);
			expect(payload.commands[0].domain).toBe(target.domain);
			expect(payload.commands[0].action).toBe(target.action);
		});
	});

	describe("capture finalize auto-adds to scope", () => {
		it("appends the finalized command to the active scope", async () => {
			const homeDir = await createIsolatedHome();
			const workDir = await createIsolatedHome();
			tempDirs.push(homeDir, workDir);

			await runSourceCli(["scope", "init"], homeDir, { cwd: workDir });

			await runCaptureNew(homeDir, workDir, [
				"scope-auto-add",
				"--domain",
				"example",
				"--action",
				"auto",
				"--runtime",
				"node",
			]);
			await writeCompleteDraft(workDir, "scope-auto-add", "node");
			const validateResult = await runCaptureValidate(homeDir, workDir, ["scope-auto-add"]);
			expect(parseJsonOutput<{ success: boolean }>(validateResult.stdout).success).toBe(true);

			const finalizeResult = await runCaptureFinalize(homeDir, workDir, ["scope-auto-add"]);
			const payload = parseJsonOutput<{ success: boolean }>(finalizeResult.stdout);
			expect(finalizeResult.exitCode).toBe(0);
			expect(payload.success).toBe(true);

			const scopePath = join(workDir, ".websculpt", "scope.json");
			const scope = JSON.parse(await readFile(scopePath, "utf8"));
			expect(scope.commands).toContain("example/auto");
		});
	});
});

async function runCaptureNew(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "new", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

async function runCaptureFinalize(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "finalize", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

async function runCaptureValidate(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "validate", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

async function writeCompleteEvidence(workDir: string, name: string, runtime: string) {
	const evidencePath = join(workDir, ".websculpt/captures", name, "evidence.md");
	const guideLine = runtime === "browser" ? "We consulted guide.md for the browser contract." : "";
	const content = `# Evidence: example/auto

This document records the research and validation evidence for the \`example/auto\` command.

## Exploration Path

We checked the command library and found no overlap. sameDomainCommands: none.
${guideLine}

## Verified URLs

- https://example.com/api

## Structural Evidence

The API returns JSON with a "data" field.

## Failure Signals

Returns EMPTY_RESULT when no data is available.

## Capture Assessment

This command should be captured because it provides reusable data collection.
`;
	await writeFile(evidencePath, content, "utf8");
}

async function writeCompleteCommand(workDir: string, name: string, runtime: string) {
	const draftPath = join(workDir, ".websculpt/captures", name, "draft");
	const entryFile = runtime === "shell" ? "command.sh" : runtime === "python" ? "command.py" : "command.js";
	const code = "export default async function(params) { return { ok: true }; }\n";
	await writeFile(join(draftPath, entryFile), code, "utf8");
}

async function writeCompleteManifest(workDir: string, name: string) {
	const manifestPath = join(workDir, ".websculpt/captures", name, "draft", "manifest.json");
	const manifest = {
		domain: "example",
		action: "auto",
		runtime: "node",
		description: "Auto example data",
		parameters: [],
		requiresBrowser: false,
		authRequired: "not-required",
	};
	await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

async function writeCompleteReadme(workDir: string, name: string) {
	const readmePath = join(workDir, ".websculpt/captures", name, "draft", "README.md");
	const content = `# example/auto

Auto example data.

## Parameters

None.

## Return Value

{ ok: true }

## Usage

websculpt example auto
`;
	await writeFile(readmePath, content, "utf8");
}

async function writeCompleteContext(workDir: string, name: string) {
	const contextPath = join(workDir, ".websculpt/captures", name, "draft", "context.md");
	const content = `# Context

## Precipitation Background

Created to collect example data.

## Value Assessment

High reuse value.

## Page Structure

https://example.com/api

## Environment Dependencies

None.

## Failure Signals

EMPTY_RESULT when no data.

## Repair Clues

Check API availability.
`;
	await writeFile(contextPath, content, "utf8");
}

async function writeCompleteDraft(workDir: string, name: string, runtime: string) {
	await writeCompleteEvidence(workDir, name, runtime);
	await writeCompleteCommand(workDir, name, runtime);
	await writeCompleteManifest(workDir, name);
	await writeCompleteReadme(workDir, name);
	await writeCompleteContext(workDir, name);
}
