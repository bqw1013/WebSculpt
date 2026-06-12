import { access, constants, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedHome, parseJsonOutput, removeTempDir, runSourceCli, websculptPath } from "./helpers/cli";
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
}

interface CaptureRestorePayload {
	success: boolean;
	command?: string;
	path?: string;
	sourceType?: string;
	next?: string;
	error?: { code: string; message: string };
}

interface CommandListPayload {
	success: boolean;
	commands?: Array<{
		domain: string;
		action: string;
		id: string;
		type: string;
		description: string;
	}>;
	error?: { code: string; message: string };
}

describe("capture restore", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	// 4.1 User restore full rollback
	it("restores a user command to the backup snapshot after finalize", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		// Register a user command with evidence.md
		const userPackage: CommandPackageBody = {
			code: "export default async function() { return { user: true, version: 1 }; }\n",
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
			"# Evidence: zhihu/get-hot\n\n## Exploration Path\n\nVisited https://www.zhihu.com/hot and inspected the hot list page.\n\n## Verified URLs\n\n- https://www.zhihu.com/hot (status 200)\n\n## Structural Evidence\n\nHot items are rendered in a `.HotList-list` container with `.HotItem` children.\n\n## Failure Signals\n\nWhen the page fails to load, `.HotList-list` is absent. When items are missing, `.HotItem` count is 0.\n\n## Capture Assessment\n\nCommand is functional and captures hot items from the current hot list.",
			"utf8",
		);
		const registered = await registerUserCommand(homeDir, "zhihu-get-hot-user", userPackage);
		expect(registered.createPayload.success).toBe(true);

		const installedPath = registered.createPayload.path;
		if (installedPath) {
			await writeFile(
				join(installedPath, "evidence.md"),
				"# Evidence: zhihu/get-hot\n\n## Exploration Path\n\nVisited https://www.zhihu.com/hot and inspected the hot list page.\n\n## Verified URLs\n\n- https://www.zhihu.com/hot (status 200)\n\n## Structural Evidence\n\nHot items are rendered in a `.HotList-list` container with `.HotItem` children.\n\n## Failure Signals\n\nWhen the page fails to load, `.HotList-list` is absent. When items are missing, `.HotItem` count is 0.\n\n## Capture Assessment\n\nCommand is functional and captures hot items from the current hot list.",
				"utf8",
			);
		}

		// Capture import the user command
		const importResult = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot"]);
		const importPayload = parseJsonOutput<CaptureImportPayload>(importResult.stdout);
		expect(importResult.exitCode).toBe(0);
		expect(importPayload.success).toBe(true);
		const workspacePath = importPayload.capture?.path ?? "";
		const workspaceName = importPayload.capture?.name ?? "";

		// Verify backup exists with original files
		await expect(access(join(workspacePath, "backup"), constants.F_OK)).resolves.toBeUndefined();
		const originalCommandJs = await readFile(join(workspacePath, "backup", "command.js"), "utf8");
		expect(originalCommandJs).toContain("version: 1");

		// Modify draft, validate, and finalize --force (simulating a repair)
		await writeFile(
			join(workspacePath, "draft", "command.js"),
			"export default async function() { return { user: true, version: 2 }; }\n",
			"utf8",
		);
		await runCaptureValidate(homeDir, workDir, [workspaceName]);
		const finalizeResult = await runCaptureFinalize(homeDir, workDir, [workspaceName, "--force"]);
		expect(finalizeResult.exitCode).toBe(0);

		// Restore
		const restoreResult = await runCaptureRestore(homeDir, workDir, [workspaceName]);
		const restorePayload = parseJsonOutput<CaptureRestorePayload>(restoreResult.stdout);
		expect(restoreResult.exitCode).toBe(0);
		expect(restorePayload.success).toBe(true);
		expect(restorePayload.sourceType).toBe("user");
		expect(restorePayload.next).toContain("Restore complete. Verify the command with:");
		expect(restorePayload.next).toContain("websculpt zhihu get-hot");

		// Verify the installed command was restored to the backup version
		const restoredCommandJs = await readFile(join(installedPath ?? "", "command.js"), "utf8");
		expect(restoredCommandJs).toContain("version: 1");
		expect(restoredCommandJs).not.toContain("version: 2");

		// Verify workspace files are unchanged
		await expect(access(join(workspacePath, "backup"), constants.F_OK)).resolves.toBeUndefined();
	});

	// 4.2 Builtin restore full rollback
	it("restores a builtin command by removing the user override after finalize", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		// Import a builtin command
		const importResult = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot"]);
		const importPayload = parseJsonOutput<CaptureImportPayload>(importResult.stdout);
		expect(importResult.exitCode).toBe(0);
		expect(importPayload.success).toBe(true);
		const workspacePath = importPayload.capture?.path ?? "";
		const workspaceName = importPayload.capture?.name ?? "";

		// Modify draft, validate, and finalize --force (overlays a user override on the builtin)
		await writeFile(
			join(workspacePath, "draft", "command.js"),
			"export default async function() { return { modified: true }; }\n",
			"utf8",
		);
		await runCaptureValidate(homeDir, workDir, [workspaceName]);
		const finalizeResult = await runCaptureFinalize(homeDir, workDir, [workspaceName, "--force"]);
		expect(finalizeResult.exitCode).toBe(0);

		// Verify the user override exists
		await expect(
			access(websculptPath(homeDir, "commands", "zhihu", "get-hot", "command.js"), constants.F_OK),
		).resolves.toBeUndefined();

		// Restore
		const restoreResult = await runCaptureRestore(homeDir, workDir, [workspaceName]);
		const restorePayload = parseJsonOutput<CaptureRestorePayload>(restoreResult.stdout);
		expect(restoreResult.exitCode).toBe(0);
		expect(restorePayload.success).toBe(true);
		expect(restorePayload.sourceType).toBe("builtin");

		// Verify the user override is removed
		await expect(
			access(websculptPath(homeDir, "commands", "zhihu", "get-hot"), constants.F_OK),
		).rejects.toMatchObject({ code: "ENOENT" });

		// Verify command list reports the builtin source
		const listResult = await runCommandList(homeDir);
		const listPayload = parseJsonOutput<CommandListPayload>(listResult.stdout);
		const cmd = listPayload.commands?.find((c) => c.domain === "zhihu" && c.action === "get-hot");
		expect(cmd).toBeDefined();
		expect(cmd?.type).toBe("builtin");
	});

	// 4.3 Builtin restore idempotence
	it("builtin restore is idempotent when user override already absent", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		// Import a builtin command (never finalized, so no user override)
		const importResult = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot"]);
		const importPayload = parseJsonOutput<CaptureImportPayload>(importResult.stdout);
		expect(importResult.exitCode).toBe(0);
		expect(importPayload.success).toBe(true);
		const workspaceName = importPayload.capture?.name ?? "";

		// Verify no user override exists
		await expect(
			access(websculptPath(homeDir, "commands", "zhihu", "get-hot"), constants.F_OK),
		).rejects.toMatchObject({ code: "ENOENT" });

		// First restore
		const firstRestore = await runCaptureRestore(homeDir, workDir, [workspaceName]);
		const firstPayload = parseJsonOutput<CaptureRestorePayload>(firstRestore.stdout);
		expect(firstRestore.exitCode).toBe(0);
		expect(firstPayload.success).toBe(true);

		// Second restore — still succeeds (idempotent)
		const secondRestore = await runCaptureRestore(homeDir, workDir, [workspaceName]);
		const secondPayload = parseJsonOutput<CaptureRestorePayload>(secondRestore.stdout);
		expect(secondRestore.exitCode).toBe(0);
		expect(secondPayload.success).toBe(true);

		// No command directory was created
		await expect(
			access(websculptPath(homeDir, "commands", "zhihu", "get-hot"), constants.F_OK),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	// 4.4 Restore error codes
	it("returns NOT_FOUND for a nonexistent workspace", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		const result = await runCaptureRestore(homeDir, workDir, ["nonexistent-workspace"]);
		const payload = parseJsonOutput<CaptureRestorePayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("NOT_FOUND");
	});

	it("returns WORKSPACE_NOT_RESTORABLE when capture.yaml lacks sourceType", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		// Create a workspace via `capture new` (no sourceType)
		const newResult = await runCaptureNew(homeDir, workDir, [
			"test-no-source",
			"--domain",
			"test",
			"--action",
			"cmd",
			"--runtime",
			"node",
		]);
		// capture new returns some output; workspace is created
		expect(newResult.exitCode).toBe(0);

		const result = await runCaptureRestore(homeDir, workDir, ["test-no-source"]);
		const payload = parseJsonOutput<CaptureRestorePayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("WORKSPACE_NOT_RESTORABLE");
	});

	it("returns BACKUP_NOT_FOUND when workspace has no backup directory", async () => {
		const { homeDir, workDir } = await createCaptureTestDirs(tempDirs);

		// Import creates a backup; delete it manually to simulate the error
		const importResult = await runCaptureImport(homeDir, workDir, ["zhihu", "get-hot"]);
		const importPayload = parseJsonOutput<CaptureImportPayload>(importResult.stdout);
		expect(importPayload.success).toBe(true);
		const workspacePath = importPayload.capture?.path ?? "";
		const workspaceName = importPayload.capture?.name ?? "";

		// Remove the backup directory
		await rm(join(workspacePath, "backup"), { recursive: true, force: true });

		const result = await runCaptureRestore(homeDir, workDir, [workspaceName]);
		const payload = parseJsonOutput<CaptureRestorePayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("BACKUP_NOT_FOUND");
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

async function runCaptureValidate(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "validate", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

async function runCaptureRestore(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "restore", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

async function runCaptureFinalize(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["capture", "finalize", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

async function runCommandList(homeDir: string) {
	return await runSourceCli(["command", "list", "--format", "json"], homeDir);
}
