import { access, constants, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createIsolatedHome, parseJsonOutput, removeTempDir, runSourceCli } from "./helpers/cli";
import { type CommandPackageBody, registerUserCommand, writeCommandDir } from "./helpers/commands";

interface CaptureImportPayload {
	success: boolean;
	capture?: {
		name: string;
		path: string;
		domain: string;
		action: string;
		runtime: string;
	};
	importedFrom?: string;
	next?: string;
	error?: { code: string; message: string };
	warnings?: Array<{ code: string; message: string; level: string }>;
}

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

describe("capture import", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("imports a builtin command into a capture workspace with all artifacts done", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot"]);
		const payload = parseJsonOutput<CaptureImportPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.capture?.domain).toBe("zhihu");
		expect(payload.capture?.action).toBe("get-hot");
		expect(payload.importedFrom).toBe("zhihu/get-hot");
		expect(payload.next).toContain("capture status");

		const workspacePath = payload.capture?.path ?? "";
		await expect(access(join(workspacePath, "capture.yaml"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "evidence.md"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "draft", "manifest.json"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "draft", "command.js"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "draft", "README.md"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "draft", "context.md"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "validation.json"), constants.F_OK)).resolves.toBeUndefined();

		// Verify capture status reports all done
		const statusResult = await runCaptureStatus(homeDir, workDir, [payload.capture?.name]);
		const statusPayload = parseJsonOutput<CaptureStatusPayload>(statusResult.stdout);
		expect(statusPayload.success).toBe(true);
		expect(statusPayload.artifacts?.evidence.status).toBe("done");
		expect(statusPayload.artifacts?.command.status).toBe("done");
		expect(statusPayload.artifacts?.manifest.status).toBe("done");
		expect(statusPayload.artifacts?.readme.status).toBe("done");
		expect(statusPayload.artifacts?.context.status).toBe("done");
		expect(statusPayload.artifacts?.validation.status).toBe("done");
		expect(statusPayload.readyToFinalize).toBe(true);
		expect(statusPayload.next?.action).toBe("finalize");
	});

	it("imports a user command with sourceCommand and user precedence over builtin", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		// Register a user command that overrides the builtin zhihu/get-hot
		const userPackage: CommandPackageBody = {
			code: "export default async function() { return { user: true }; }\n",
			manifest: {
				action: "get-hot",
				description: "User override of zhihu get-hot",
				domain: "zhihu",
				id: "zhihu-get-hot",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			},
		};
		const commandDirPath = await writeCommandDir(homeDir, "zhihu-get-hot-user", userPackage);
		await writeFile(
			join(commandDirPath, "README.md"),
			"# zhihu/get-hot\n\n## Description\n\nGets hot items.\n\n## Parameters\n\nNone.\n\n## Usage\n\nwebsculpt zhihu get-hot\n",
			"utf8",
		);
		await writeFile(
			join(commandDirPath, "context.md"),
			"# Context\n\n## Precipitation Background\n\n## Page Structure\n\n## Environment Dependencies\n\n## Failure Signals\n\n## Repair Clues\n\n## Value Assessment\n\n",
			"utf8",
		);
		await writeFile(
			join(commandDirPath, "evidence.md"),
			"# Evidence: zhihu/get-hot\n\n## Exploration Path\n\n## Verified URLs\n\n## Structural Evidence\n\n## Failure Signals\n\n## Capture Assessment\n",
			"utf8",
		);
		const registered = await registerUserCommand(homeDir, "zhihu-get-hot-user", userPackage);
		expect(registered.createPayload.success).toBe(true);

		// command create does not copy evidence.md, so add it manually to the installed command
		const installedPath = registered.createPayload.path;
		if (installedPath) {
			await writeFile(
				join(installedPath, "evidence.md"),
				"# Evidence: zhihu/get-hot\n\n## Exploration Path\n\n## Verified URLs\n\n## Structural Evidence\n\n## Failure Signals\n\n## Capture Assessment\n",
				"utf8",
			);
		}

		const result = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot"]);
		const payload = parseJsonOutput<CaptureImportPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.importedFrom).toBe("zhihu/get-hot");

		// Verify the imported draft is the user version
		const workspacePath = payload.capture?.path ?? "";
		const commandJs = await readFile(join(workspacePath, "draft", "command.js"), "utf8");
		expect(commandJs).toContain("user: true");

		// Verify capture.yaml sourceCommand
		const captureYaml = parse(await readFile(join(workspacePath, "capture.yaml"), "utf8")) as {
			sourceCommand: string | null;
		};
		expect(captureYaml.sourceCommand).toBe("zhihu/get-hot");
	});

	it("resolves name collisions with incremental suffix", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const now = new Date();
		const yy = String(now.getFullYear()).slice(2);
		const mm = String(now.getMonth() + 1).padStart(2, "0");
		const dd = String(now.getDate()).padStart(2, "0");
		const baseName = `zhihu-get-hot-${yy}${mm}${dd}`;

		// Pre-create the base workspace to force collision
		await runCaptureNew(homeDir, workDir, [baseName, "--domain", "example", "--action", "test", "--runtime", "node"]);

		const result = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot"]);
		const payload = parseJsonOutput<CaptureImportPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.capture?.name).toBe(`${baseName}-1`);

		// Pre-create the -1 workspace to force another collision
		await runCaptureNew(homeDir, workDir, [
			`${baseName}-1`,
			"--domain",
			"example",
			"--action",
			"test2",
			"--runtime",
			"node",
		]);

		const result2 = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot"]);
		const payload2 = parseJsonOutput<CaptureImportPayload>(result2.stdout);
		expect(payload2.success).toBe(true);
		expect(payload2.capture?.name).toBe(`${baseName}-2`);
	});

	it("returns EVIDENCE_MISSING when installed command lacks evidence.md", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		// Register a user command without evidence.md
		const userPackage: CommandPackageBody = {
			code: "export default async function() { return { ok: true }; }\n",
			manifest: {
				action: "no-evidence",
				description: "Command without evidence",
				domain: "test",
				id: "test-no-evidence",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			},
		};
		const registered = await registerUserCommand(homeDir, "test-no-evidence", userPackage);
		expect(registered.createPayload.success).toBe(true);

		const result = await runCaptureImport(homeDir, workDir, ["test", "no-evidence"]);
		const payload = parseJsonOutput<CaptureImportPayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("EVIDENCE_MISSING");

		// Verify no workspace was created
		const now = new Date();
		const yy = String(now.getFullYear()).slice(2);
		const mm = String(now.getMonth() + 1).padStart(2, "0");
		const dd = String(now.getDate()).padStart(2, "0");
		const baseName = `test-no-evidence-${yy}${mm}${dd}`;
		await expect(access(join(workDir, ".websculpt/captures", baseName), constants.F_OK)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("triggers stale validation after modifying an imported draft file", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const importResult = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot"]);
		const importPayload = parseJsonOutput<CaptureImportPayload>(importResult.stdout);
		expect(importPayload.success).toBe(true);

		const workspacePath = importPayload.capture?.path ?? "";
		const draftPath = join(workspacePath, "draft");

		// Modify a draft file
		await writeFile(
			join(draftPath, "command.js"),
			"export default async function() { return { modified: true }; }\n",
			"utf8",
		);

		const statusResult = await runCaptureStatus(homeDir, workDir, [importPayload.capture?.name]);
		const statusPayload = parseJsonOutput<CaptureStatusPayload>(statusResult.stdout);

		expect(statusPayload.success).toBe(true);
		expect(statusPayload.artifacts?.validation.status).toBe("blocked");
		expect(statusPayload.artifacts?.validation.reason).toContain("changed after last validation");
		expect(statusPayload.next?.action).toBe("validate");
	});

	it("accepts custom --name and rejects duplicates", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const firstResult = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot", "--name", "my-repair"]);
		const firstPayload = parseJsonOutput<CaptureImportPayload>(firstResult.stdout);
		expect(firstResult.exitCode).toBe(0);
		expect(firstPayload.success).toBe(true);
		expect(firstPayload.capture?.name).toBe("my-repair");

		const secondResult = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot", "--name", "my-repair"]);
		const secondPayload = parseJsonOutput<CaptureImportPayload>(secondResult.stdout);
		expect(secondResult.exitCode).toBe(1);
		expect(secondPayload.success).toBe(false);
		expect(secondPayload.error?.code).toBe("ALREADY_EXISTS");
	});

	it("rejects invalid custom --name", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot", "--name", "my_repair"]);
		const payload = parseJsonOutput<CaptureImportPayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("INVALID_CAPTURE_NAME");
	});

	it("returns NOT_FOUND when command does not exist", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureImport(homeDir, workDir, ["nonexistent", "domain"]);
		const payload = parseJsonOutput<CaptureImportPayload>(result.stdout);

		expect(result.exitCode).toBe(1);
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

async function runCaptureImport(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "import", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

async function runCaptureNew(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "new", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

async function runCaptureStatus(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "status", ...args, "--format", "json"], homeDir, { cwd: workDir });
}
