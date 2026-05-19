import { access, constants, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedHome, parseJsonOutput, removeTempDir, runSourceCli, websculptPath } from "./helpers/cli";
import { type CommandPackageBody, registerUserCommand } from "./helpers/commands";

interface CaptureFinalizePayload {
	success: boolean;
	command?: string;
	path?: string;
	error?: { code: string; message: string };
	warnings?: Array<{ code: string; message: string; level: string }>;
}

describe("capture finalize", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("installs the command when validation passed and evidence is complete", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"finalize-ok",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteDraft(workDir, "finalize-ok", "node");
		const validateResult = await runCaptureValidate(homeDir, workDir, ["finalize-ok"]);
		expect(parseJsonOutput<CaptureFinalizePayload>(validateResult.stdout).success).toBe(true);

		const result = await runCaptureFinalize(homeDir, workDir, ["finalize-ok"]);
		const payload = parseJsonOutput<CaptureFinalizePayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.command).toBe("example/collect");

		// Verify installed command exists
		const installedPath = websculptPath(homeDir, "commands", "example", "collect");
		await expect(access(join(installedPath, "command.js"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(installedPath, "manifest.json"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(installedPath, "evidence.md"), constants.F_OK)).resolves.toBeUndefined();
	});

	it("returns EVIDENCE_NOT_READY when evidence audit fails", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"ev-bad",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteDraft(workDir, "ev-bad", "node");
		const validateResult = await runCaptureValidate(homeDir, workDir, ["ev-bad"]);
		expect(parseJsonOutput<CaptureFinalizePayload>(validateResult.stdout).success).toBe(true);
		// Break evidence by leaving it empty
		await writeFile(
			join(workDir, ".websculpt/captures", "ev-bad", "evidence.md"),
			"# Evidence: example/collect\n\n## Exploration Path\n\n## Verified URLs\n\n## Structural Evidence\n\n## Failure Signals\n\n## Capture Assessment\n",
			"utf8",
		);

		const result = await runCaptureFinalize(homeDir, workDir, ["ev-bad"]);
		const payload = parseJsonOutput<CaptureFinalizePayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("EVIDENCE_NOT_READY");

		// No installation should have occurred
		const installedPath = websculptPath(homeDir, "commands", "example", "collect");
		await expect(access(join(installedPath, "command.js"), constants.F_OK)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("returns VALIDATION_NOT_FOUND when validation.json is missing", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"no-val",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteDraft(workDir, "no-val", "node");

		const result = await runCaptureFinalize(homeDir, workDir, ["no-val"]);
		const payload = parseJsonOutput<CaptureFinalizePayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("VALIDATION_NOT_FOUND");
	});

	it("returns VALIDATION_FAILED when validation.json reports failure", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"val-bad",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteDraft(workDir, "val-bad", "node");
		await writeValidationJson(workDir, "val-bad", false);

		const result = await runCaptureFinalize(homeDir, workDir, ["val-bad"]);
		const payload = parseJsonOutput<CaptureFinalizePayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("VALIDATION_FAILED");
	});

	it("returns NOT_FOUND for a non-existent workspace", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureFinalize(homeDir, workDir, ["no-such-cap"]);
		const payload = parseJsonOutput<CaptureFinalizePayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("NOT_FOUND");
	});

	it("preserves the workspace after successful finalize", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"preserve",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteDraft(workDir, "preserve", "node");
		const validateResult = await runCaptureValidate(homeDir, workDir, ["preserve"]);
		expect(parseJsonOutput<CaptureFinalizePayload>(validateResult.stdout).success).toBe(true);

		const result = await runCaptureFinalize(homeDir, workDir, ["preserve"]);
		const payload = parseJsonOutput<CaptureFinalizePayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);

		const workspacePath = join(workDir, ".websculpt/captures", "preserve");
		await expect(access(join(workspacePath, "capture.yaml"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "evidence.md"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "draft", "command.js"), constants.F_OK)).resolves.toBeUndefined();
	});

	it("returns VALIDATION_STALE when draft files changed after successful validation", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"stale-finalize",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteDraft(workDir, "stale-finalize", "node");
		const validateResult = await runCaptureValidate(homeDir, workDir, ["stale-finalize"]);
		expect(parseJsonOutput<CaptureFinalizePayload>(validateResult.stdout).success).toBe(true);
		await writeFile(
			join(workDir, ".websculpt/captures", "stale-finalize", "draft", "README.md"),
			`# example/collect

Collects changed example data.

## Parameters

None.

## Return Value

{ ok: true }

## Usage

websculpt example collect
`,
			"utf8",
		);

		const result = await runCaptureFinalize(homeDir, workDir, ["stale-finalize"]);
		const payload = parseJsonOutput<CaptureFinalizePayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("VALIDATION_STALE");
	});

	it("overwrites an existing user command when capture new was forced through a user conflict", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		const existingPackage: CommandPackageBody = {
			code: "export default async function() { return { old: true }; }\n",
			manifest: {
				action: "collect",
				description: "Old example command",
				domain: "example",
				id: "example-collect",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			},
		};
		const existingResult = await registerUserCommand(homeDir, "existing-example-collect", existingPackage);
		expect(existingResult.createPayload.success).toBe(true);

		await runCaptureNew(homeDir, workDir, [
			"force-user-conflict",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
			"--force",
		]);
		await writeCompleteDraft(workDir, "force-user-conflict", "node");
		const validateResult = await runCaptureValidate(homeDir, workDir, ["force-user-conflict"]);
		expect(parseJsonOutput<CaptureFinalizePayload>(validateResult.stdout).success).toBe(true);

		const result = await runCaptureFinalize(homeDir, workDir, ["force-user-conflict"]);
		const payload = parseJsonOutput<CaptureFinalizePayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.command).toBe("example/collect");
		const manifestContent = await readFile(
			websculptPath(homeDir, "commands", "example", "collect", "manifest.json"),
			"utf8",
		);
		expect(manifestContent).toContain("Collect example data");
	});
});

async function createCaptureTestDirs(tempDirs: string[]): Promise<{ homeDir: string; workDir: string }> {
	const homeDir = await createIsolatedHome();
	const workDir = await createIsolatedHome();
	tempDirs.push(homeDir, workDir);
	return { homeDir, workDir };
}

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
	const content = `# Evidence: example/collect

This document records the research and validation evidence for the \`example/collect\` command.

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
	const code =
		runtime === "browser"
			? "export default async (page, params) => { return { ok: true }; };\n"
			: "export default async function(params) { return { ok: true }; }\n";
	await writeFile(join(draftPath, entryFile), code, "utf8");
}

async function writeCompleteManifest(workDir: string, name: string) {
	const manifestPath = join(workDir, ".websculpt/captures", name, "draft", "manifest.json");
	const manifest = {
		domain: "example",
		action: "collect",
		runtime: "node",
		description: "Collect example data",
		parameters: [],
		requiresBrowser: false,
		authRequired: "not-required",
	};
	await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

async function writeCompleteReadme(workDir: string, name: string) {
	const readmePath = join(workDir, ".websculpt/captures", name, "draft", "README.md");
	const content = `# example/collect

Collects example data.

## Parameters

None.

## Return Value

{ ok: true }

## Usage

websculpt example collect
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

async function writeValidationJson(workDir: string, name: string, success: boolean) {
	const validationPath = join(workDir, ".websculpt/captures", name, "validation.json");
	await writeFile(validationPath, JSON.stringify({ success, timestamp: new Date().toISOString() }, null, 2), "utf8");
}
