import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedHome, parseJsonOutput, removeTempDir, runSourceCli } from "./helpers/cli";

interface CaptureValidatePayload {
	success: boolean;
	error?: { code: string; message: string; details?: Array<{ code: string; message: string; level: string }> };
	warnings?: Array<{ code: string; message: string; level: string }>;
}

interface ValidationJson {
	draftFingerprint?: string;
	success: boolean;
	timestamp: string;
	warnings?: Array<{ code: string; message: string; level: string }>;
	errors?: Array<{ code: string; message: string; level: string }>;
}

describe("capture validate", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("returns success and writes validation.json for a valid draft", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"valid-cap",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteDraft(workDir, "valid-cap", "node");

		const result = await runCaptureValidate(homeDir, workDir, ["valid-cap"]);
		const payload = parseJsonOutput<CaptureValidatePayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);

		const validationJson = await readJsonFile<ValidationJson>(
			join(workDir, ".websculpt-captures", "valid-cap", "validation.json"),
		);
		expect(validationJson.success).toBe(true);
		expect(validationJson.draftFingerprint).toEqual(expect.any(String));
	});

	it("returns failure and writes validation.json for an invalid draft", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"invalid-cap",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		// Make command.js invalid by removing the export default
		await writeCompleteEvidence(workDir, "invalid-cap", "node");
		await writeFile(
			join(workDir, ".websculpt-captures", "invalid-cap", "draft", "command.js"),
			"// broken - no export\n",
			"utf8",
		);
		await writeFile(
			join(workDir, ".websculpt-captures", "invalid-cap", "draft", "manifest.json"),
			JSON.stringify({
				domain: "example",
				action: "collect",
				runtime: "node",
				description: "test",
				requiresBrowser: false,
			}),
			"utf8",
		);
		await writeCompleteReadme(workDir, "invalid-cap");
		await writeCompleteContext(workDir, "invalid-cap");

		const result = await runCaptureValidate(homeDir, workDir, ["invalid-cap"]);
		const payload = parseJsonOutput<CaptureValidatePayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("VALIDATION_ERROR");

		const validationJson = await readJsonFile<ValidationJson>(
			join(workDir, ".websculpt-captures", "invalid-cap", "validation.json"),
		);
		expect(validationJson.success).toBe(false);
		expect(validationJson.errors).toBeDefined();
		expect(validationJson.draftFingerprint).toEqual(expect.any(String));
	});

	it("overwrites a previous validation result", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"overwrite-cap",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteDraft(workDir, "overwrite-cap", "node");

		// First validate (success)
		const firstResult = await runCaptureValidate(homeDir, workDir, ["overwrite-cap"]);
		expect(parseJsonOutput<CaptureValidatePayload>(firstResult.stdout).success).toBe(true);

		// Break the draft
		await writeFile(
			join(workDir, ".websculpt-captures", "overwrite-cap", "draft", "command.js"),
			"// broken\n",
			"utf8",
		);

		// Second validate (failure)
		const secondResult = await runCaptureValidate(homeDir, workDir, ["overwrite-cap"]);
		const payload = parseJsonOutput<CaptureValidatePayload>(secondResult.stdout);
		expect(payload.success).toBe(false);

		const validationJson = await readJsonFile<ValidationJson>(
			join(workDir, ".websculpt-captures", "overwrite-cap", "validation.json"),
		);
		expect(validationJson.success).toBe(false);
	});

	it("fails validation and persists MANIFEST_MISMATCH when manifest runtime differs from capture metadata", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"runtime-mismatch",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"browser",
		]);
		await writeCompleteEvidence(workDir, "runtime-mismatch", "browser");
		await writeCompleteCommand(workDir, "runtime-mismatch", "browser");
		await writeFile(
			join(workDir, ".websculpt-captures", "runtime-mismatch", "draft", "manifest.json"),
			JSON.stringify({
				domain: "example",
				action: "collect",
				runtime: "node",
				description: "Collect example data",
				parameters: [],
				requiresBrowser: false,
				authRequired: "not-required",
			}),
			"utf8",
		);
		await writeCompleteReadme(workDir, "runtime-mismatch");
		await writeCompleteContext(workDir, "runtime-mismatch");

		const result = await runCaptureValidate(homeDir, workDir, ["runtime-mismatch"]);
		const payload = parseJsonOutput<CaptureValidatePayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error?.details).toContainEqual(
			expect.objectContaining({
				code: "MANIFEST_MISMATCH",
				level: "error",
			}),
		);

		const validationJson = await readJsonFile<ValidationJson>(
			join(workDir, ".websculpt-captures", "runtime-mismatch", "validation.json"),
		);
		expect(validationJson.success).toBe(false);
		expect(validationJson.errors).toContainEqual(
			expect.objectContaining({
				code: "MANIFEST_MISMATCH",
				level: "error",
			}),
		);
		expect(validationJson.draftFingerprint).toEqual(expect.any(String));
	});

	it("returns NOT_FOUND for a non-existent workspace", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureValidate(homeDir, workDir, ["no-such-cap"]);
		const payload = parseJsonOutput<CaptureValidatePayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("NOT_FOUND");
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

async function runCaptureValidate(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "validate", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

async function readJsonFile<T>(filePath: string): Promise<T> {
	const raw = await readFile(filePath, "utf8");
	return JSON.parse(raw) as T;
}

async function writeCompleteEvidence(workDir: string, name: string, runtime: string) {
	const evidencePath = join(workDir, ".websculpt-captures", name, "evidence.md");
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

## Parameters and Samples

Input: { "limit": 10 }
Output: { "items": [] }

## Failure Signals

Returns EMPTY_RESULT when no data is available.

## Capture Assessment

This command should be captured because it provides reusable data collection.
`;
	await writeFile(evidencePath, content, "utf8");
}

async function writeCompleteCommand(workDir: string, name: string, runtime: string) {
	const draftPath = join(workDir, ".websculpt-captures", name, "draft");
	const entryFile = runtime === "shell" ? "command.sh" : runtime === "python" ? "command.py" : "command.js";
	const code =
		runtime === "browser"
			? "export default async (page, params) => { return { ok: true }; };\n"
			: "export default async function(params) { return { ok: true }; }\n";
	await writeFile(join(draftPath, entryFile), code, "utf8");
}

async function writeCompleteManifest(workDir: string, name: string) {
	const manifestPath = join(workDir, ".websculpt-captures", name, "draft", "manifest.json");
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
	const readmePath = join(workDir, ".websculpt-captures", name, "draft", "README.md");
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
	const contextPath = join(workDir, ".websculpt-captures", name, "draft", "context.md");
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
