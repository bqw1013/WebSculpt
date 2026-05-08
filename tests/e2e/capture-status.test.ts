import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedHome, parseJsonOutput, removeTempDir, runSourceCli } from "./helpers/cli";

interface CaptureStatusPayload {
	success: boolean;
	capture?: { name: string; path: string };
	artifacts?: {
		evidence: { status: string; reason?: string };
		command: { status: string; reason?: string };
		manifest: { status: string; reason?: string };
		readme: { status: string; reason?: string };
		context: { status: string; reason?: string };
		validation: { status: string; reason?: string };
	};
	readyToFinalize?: boolean;
	next?: { action: string; target?: string };
	error?: { code: string; message: string };
	warnings?: Array<{ code: string; message: string; level: string }>;
}

describe("capture status", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("reports fresh workspace with evidence blocked and all artifacts blocked", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"fresh-cap",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);

		const result = await runCaptureStatus(homeDir, workDir, ["fresh-cap"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.evidence.status).toBe("blocked");
		expect(payload.artifacts?.command.status).toBe("blocked");
		expect(payload.artifacts?.manifest.status).toBe("blocked");
		expect(payload.artifacts?.readme.status).toBe("blocked");
		expect(payload.artifacts?.context.status).toBe("blocked");
		expect(payload.artifacts?.validation.status).toBe("blocked");
		expect(payload.readyToFinalize).toBe(false);
		expect(payload.next?.action).toBe("fill-evidence");
	});

	it("reports evidence done and command ready when evidence is complete but command is still a template", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"ev-done",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteEvidence(workDir, "ev-done", "node");

		const result = await runCaptureStatus(homeDir, workDir, ["ev-done"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.evidence.status).toBe("done");
		expect(payload.artifacts?.command.status).toBe("ready");
		expect(payload.next?.action).toBe("fill-command");
	});

	it("reports command done and manifest ready when manifest description is empty", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"manifest-ready",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteEvidence(workDir, "manifest-ready", "node");
		await writeCompleteCommand(workDir, "manifest-ready", "node");

		const result = await runCaptureStatus(homeDir, workDir, ["manifest-ready"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.evidence.status).toBe("done");
		expect(payload.artifacts?.command.status).toBe("done");
		expect(payload.artifacts?.manifest.status).toBe("ready");
		expect(payload.next?.action).toBe("fill-manifest");
	});

	it("reports readyToFinalize when all artifacts are done and validation passed", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"all-done",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteEvidence(workDir, "all-done", "node");
		await writeCompleteCommand(workDir, "all-done", "node");
		await writeCompleteManifest(workDir, "all-done");
		await writeCompleteReadme(workDir, "all-done");
		await writeCompleteContext(workDir, "all-done");
		const validateResult = await runCaptureValidate(homeDir, workDir, ["all-done"]);
		expect(parseJsonOutput<CaptureStatusPayload>(validateResult.stdout).success).toBe(true);

		const result = await runCaptureStatus(homeDir, workDir, ["all-done"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.evidence.status).toBe("done");
		expect(payload.artifacts?.command.status).toBe("done");
		expect(payload.artifacts?.manifest.status).toBe("done");
		expect(payload.artifacts?.readme.status).toBe("done");
		expect(payload.artifacts?.context.status).toBe("done");
		expect(payload.artifacts?.validation.status).toBe("done");
		expect(payload.readyToFinalize).toBe(true);
		expect(payload.next?.action).toBe("request-user-confirmation");
	});

	it("reports validation blocked and next action validate when validation previously failed", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"val-fail",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteEvidence(workDir, "val-fail", "node");
		await writeCompleteCommand(workDir, "val-fail", "node");
		await writeCompleteManifest(workDir, "val-fail");
		await writeCompleteReadme(workDir, "val-fail");
		await writeCompleteContext(workDir, "val-fail");
		await writeValidationJson(workDir, "val-fail", false);

		const result = await runCaptureStatus(homeDir, workDir, ["val-fail"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.validation.status).toBe("blocked");
		expect(payload.artifacts?.validation.reason).toContain("failed");
		expect(payload.next?.action).toBe("validate");
	});

	it("blocks command, manifest, readme, context, and validation on manifest identity mismatch", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"mismatch",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteEvidence(workDir, "mismatch", "node");
		await writeCompleteCommand(workDir, "mismatch", "node");
		await writeFile(
			join(workDir, ".websculpt-captures", "mismatch", "draft", "manifest.json"),
			JSON.stringify({ domain: "wrong", action: "collect", runtime: "node", description: "ok" }),
			"utf8",
		);

		const result = await runCaptureStatus(homeDir, workDir, ["mismatch"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.command.status).toBe("blocked");
		expect(payload.artifacts?.manifest.status).toBe("blocked");
		expect(payload.artifacts?.readme.status).toBe("blocked");
		expect(payload.artifacts?.context.status).toBe("blocked");
		expect(payload.artifacts?.validation.status).toBe("blocked");
		expect(payload.artifacts?.command.reason).toContain("does not match capture domain");
		expect(payload.artifacts?.manifest.reason).toContain("does not match capture domain");
		expect(payload.artifacts?.validation.reason).toContain("does not match capture domain");
		expect(payload.next?.action).toBe("fill-manifest");
	});

	it("blocks runtime mismatch even when the manifest domain and action match", async () => {
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
				requiresBrowser: false,
			}),
			"utf8",
		);

		const result = await runCaptureStatus(homeDir, workDir, ["runtime-mismatch"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.command.status).toBe("blocked");
		expect(payload.artifacts?.command.reason).toContain("does not match capture runtime");
		expect(payload.next?.action).toBe("fill-manifest");
	});

	it("reports manifest blocked instead of STATUS_ERROR when manifest JSON is invalid", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"bad-manifest-json",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteEvidence(workDir, "bad-manifest-json", "node");
		await writeCompleteCommand(workDir, "bad-manifest-json", "node");
		await writeFile(
			join(workDir, ".websculpt-captures", "bad-manifest-json", "draft", "manifest.json"),
			"{ invalid json",
			"utf8",
		);

		const result = await runCaptureStatus(homeDir, workDir, ["bad-manifest-json"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.manifest.status).toBe("blocked");
		expect(payload.artifacts?.manifest.reason).toContain("Manifest JSON is invalid");
		expect(payload.next?.action).toBe("fill-manifest");
	});

	it("keeps README ready while any TODO marker remains", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"readme-todo",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteEvidence(workDir, "readme-todo", "node");
		await writeCompleteCommand(workDir, "readme-todo", "node");
		await writeCompleteManifest(workDir, "readme-todo");
		await writeFile(
			join(workDir, ".websculpt-captures", "readme-todo", "draft", "README.md"),
			`# example/collect

Collects example data.

## Parameters

None.

## Return Value

{ ok: true }

## Usage

websculpt example collect

## Common Error Codes

TODO: list common business error codes.
`,
			"utf8",
		);

		const result = await runCaptureStatus(homeDir, workDir, ["readme-todo"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.readme.status).toBe("ready");
		expect(payload.next?.action).toBe("fill-readme");
	});

	it("blocks validation when draft files changed after a successful validation", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"stale-validation",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteEvidence(workDir, "stale-validation", "node");
		await writeCompleteCommand(workDir, "stale-validation", "node");
		await writeCompleteManifest(workDir, "stale-validation");
		await writeCompleteReadme(workDir, "stale-validation");
		await writeCompleteContext(workDir, "stale-validation");
		const validateResult = await runCaptureValidate(homeDir, workDir, ["stale-validation"]);
		expect(parseJsonOutput<CaptureStatusPayload>(validateResult.stdout).success).toBe(true);
		await writeFile(
			join(workDir, ".websculpt-captures", "stale-validation", "draft", "command.js"),
			"export default async function(params) { return { ok: true, changed: true }; }\n",
			"utf8",
		);

		const result = await runCaptureStatus(homeDir, workDir, ["stale-validation"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.command.status).toBe("done");
		expect(payload.artifacts?.validation.status).toBe("blocked");
		expect(payload.artifacts?.validation.reason).toContain("changed after last validation");
		expect(payload.readyToFinalize).toBe(false);
		expect(payload.next?.action).toBe("validate");
	});

	it("returns NOT_FOUND for a non-existent workspace", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureStatus(homeDir, workDir, ["no-such-cap"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("NOT_FOUND");
	});

	it("reports command ready when a previously done command is regressed to template", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);
		await runCaptureNew(homeDir, workDir, [
			"regress",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		await writeCompleteEvidence(workDir, "regress", "node");
		await writeCompleteCommand(workDir, "regress", "node");
		await writeCompleteManifest(workDir, "regress");
		await writeCompleteReadme(workDir, "regress");
		await writeCompleteContext(workDir, "regress");
		await writeValidationJson(workDir, "regress", true);

		// Regress command.js back to template
		const draftPath = join(workDir, ".websculpt-captures", "regress", "draft");
		await writeFile(join(draftPath, "command.js"), "// TODO: implement command logic\n", "utf8");

		const result = await runCaptureStatus(homeDir, workDir, ["regress"]);
		const payload = parseJsonOutput<CaptureStatusPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.artifacts?.command.status).toBe("ready");
		expect(payload.next?.action).toBe("fill-command");
		expect(payload.readyToFinalize).toBe(false);
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

async function runCaptureStatus(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "status", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

async function runCaptureValidate(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "validate", ...args, "--format", "json"], homeDir, { cwd: workDir });
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

async function writeValidationJson(workDir: string, name: string, success: boolean) {
	const validationPath = join(workDir, ".websculpt-captures", name, "validation.json");
	await writeFile(validationPath, JSON.stringify({ success, timestamp: new Date().toISOString() }, null, 2), "utf8");
}
