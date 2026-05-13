import { access, constants, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createIsolatedHome, parseJsonOutput, readJsonFile, removeTempDir, runSourceCli } from "./helpers/cli";
import { type CommandCreateResult, notesSavePackage, registerUserCommand } from "./helpers/commands";

interface CaptureNewPayload {
	capture?: {
		name: string;
		path: string;
		domain: string;
		action: string;
		runtime: string;
	};
	commandLibrarySnapshot?: {
		totalCommands: number;
		sameDomainCommands: string[];
		nameConflict: boolean;
		conflictSource?: "user" | "builtin";
	};
	error?: {
		code: string;
		message: string;
	};
	next?: string;
	success: boolean;
	warnings?: Array<{ code: string; message: string; level: string }>;
}

interface CaptureYaml {
	name: string;
	domain: string;
	action: string;
	runtime: string;
	createdAt: string;
	schema: string;
	commandLibrarySnapshot: {
		totalCommands: number;
		sameDomainCommands: string[];
		nameConflict: boolean;
		conflictSource?: "user" | "builtin";
	};
}

describe("capture new", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("creates a capture workspace with metadata, evidence, and draft files", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureNew(homeDir, workDir, [
			"my-capture",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		const payload = parseJsonOutput<CaptureNewPayload>(result.stdout);
		const workspacePath = join(workDir, ".websculpt-captures", "my-capture");

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.capture).toEqual(
			expect.objectContaining({
				name: "my-capture",
				path: workspacePath,
				domain: "example",
				action: "collect",
				runtime: "node",
			}),
		);
		expect(payload.commandLibrarySnapshot).toEqual(
			expect.objectContaining({
				totalCommands: expect.any(Number),
				sameDomainCommands: [],
				nameConflict: false,
			}),
		);
		expect(payload.next).toBe("websculpt capture status my-capture");

		await expect(access(join(workspacePath, "capture.yaml"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "evidence.md"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "draft"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "draft", "command.js"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "draft", "README.md"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "draft", "context.md"), constants.F_OK)).resolves.toBeUndefined();

		const captureYaml = parse(await readFile(join(workspacePath, "capture.yaml"), "utf8")) as CaptureYaml;
		expect(captureYaml).toEqual(
			expect.objectContaining({
				name: "my-capture",
				domain: "example",
				action: "collect",
				runtime: "node",
				schema: "command-capture",
			}),
		);
		expect(Date.parse(captureYaml.createdAt)).not.toBeNaN();

		const manifest = await readJsonFile<{ domain: string; action: string; runtime: string; id?: string }>(
			join(workspacePath, "draft", "manifest.json"),
		);
		expect(manifest.domain).toBe("example");
		expect(manifest.action).toBe("collect");
		expect(manifest.runtime).toBe("node");
		expect(manifest.id).toBe("example-collect");

		const evidence = await readFile(join(workspacePath, "evidence.md"), "utf8");
		expect(evidence).toContain("## Exploration Path");
		expect(evidence).toContain("## Verified URLs");
		expect(evidence).toContain("## Structural Evidence");
		expect(evidence).toContain("## Failure Signals");
		expect(evidence).toContain("## Capture Assessment");
		expect(evidence).toContain("This document records the research and validation evidence");
	});

	it("uses browser runtime templates when requested", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureNew(homeDir, workDir, [
			"browser-capture",
			"--domain",
			"example",
			"--action",
			"browse",
			"--runtime",
			"browser",
		]);
		const payload = parseJsonOutput<CaptureNewPayload>(result.stdout);
		const commandJs = await readFile(
			join(workDir, ".websculpt-captures", "browser-capture", "draft", "command.js"),
			"utf8",
		);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.capture?.runtime).toBe("browser");
		expect(commandJs).toContain("export default async (page, params)");
	});

	it("rejects invalid capture names", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const spaceResult = await runCaptureNew(homeDir, workDir, [
			"my capture",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		const uppercaseResult = await runCaptureNew(homeDir, workDir, [
			"MyCapture",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);

		expect(parseJsonOutput<CaptureNewPayload>(spaceResult.stdout).error?.code).toBe("INVALID_CAPTURE_NAME");
		expect(parseJsonOutput<CaptureNewPayload>(uppercaseResult.stdout).error?.code).toBe("INVALID_CAPTURE_NAME");
	});

	it("rejects reserved capture domain", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureNew(homeDir, workDir, [
			"capture-domain",
			"--domain",
			"capture",
			"--action",
			"sync",
			"--runtime",
			"node",
		]);
		const payload = parseJsonOutput<CaptureNewPayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("RESERVED_DOMAIN");
	});

	it("rejects duplicate workspace names without force", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const firstResult = await runCaptureNew(homeDir, workDir, [
			"existing-capture",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		const secondResult = await runCaptureNew(homeDir, workDir, [
			"existing-capture",
			"--domain",
			"example",
			"--action",
			"collect",
			"--runtime",
			"node",
		]);
		const payload = parseJsonOutput<CaptureNewPayload>(secondResult.stdout);

		expect(parseJsonOutput<CaptureNewPayload>(firstResult.stdout).success).toBe(true);
		expect(secondResult.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("CAPTURE_ALREADY_EXISTS");
	});

	it("rejects existing user command conflicts without force", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const { createPayload } = await registerUserCommand(homeDir, "note-save-package", notesSavePackage);
		expect(createPayload.success).toBe(true);

		const result = await runCaptureNew(homeDir, workDir, [
			"notes-save",
			"--domain",
			"notes",
			"--action",
			"save",
			"--runtime",
			"node",
		]);
		const payload = parseJsonOutput<CaptureNewPayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("COMMAND_ALREADY_EXISTS");
	});

	it("warns but succeeds for builtin command conflicts", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureNew(homeDir, workDir, [
			"github-trending",
			"--domain",
			"github",
			"--action",
			"get-trending",
			"--runtime",
			"browser",
		]);
		const payload = parseJsonOutput<CaptureNewPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.commandLibrarySnapshot).toEqual(
			expect.objectContaining({
				nameConflict: true,
				conflictSource: "builtin",
			}),
		);
		expect(payload.commandLibrarySnapshot?.sameDomainCommands).toContain("github/get-trending");
		expect(payload.warnings).toContainEqual(
			expect.objectContaining({
				code: "BUILTIN_OVERRIDE",
				level: "warning",
			}),
		);
	});

	it("allows user command conflicts and overwrites workspaces with force", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const createResult = await registerUserCommand(homeDir, "note-save-package", notesSavePackage);
		expect((createResult.createPayload as CommandCreateResult).success).toBe(true);

		const firstResult = await runCaptureNew(homeDir, workDir, [
			"force-capture",
			"--domain",
			"notes",
			"--action",
			"save",
			"--runtime",
			"node",
			"--force",
		]);
		const workspacePath = join(workDir, ".websculpt-captures", "force-capture");
		await writeFile(join(workspacePath, "obsolete.txt"), "obsolete", "utf8");

		const secondResult = await runCaptureNew(homeDir, workDir, [
			"force-capture",
			"--domain",
			"notes",
			"--action",
			"save",
			"--runtime",
			"node",
			"--force",
		]);
		const payload = parseJsonOutput<CaptureNewPayload>(secondResult.stdout);

		expect(parseJsonOutput<CaptureNewPayload>(firstResult.stdout).success).toBe(true);
		expect(secondResult.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.commandLibrarySnapshot).toEqual(
			expect.objectContaining({
				nameConflict: true,
				conflictSource: "user",
			}),
		);
		await expect(access(join(workspacePath, "obsolete.txt"), constants.F_OK)).rejects.toMatchObject({
			code: "ENOENT",
		});
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
