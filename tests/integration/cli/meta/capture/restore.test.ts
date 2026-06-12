import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";

// Dynamic import so we can control when USER_COMMANDS_DIR is resolved
let handleCaptureRestore: typeof import("../../../../../src/cli/meta/capture/restore.js").handleCaptureRestore;
type CaptureRestoreResult = import("../../../../../src/cli/output.js").CaptureRestoreResult;

describe("handleCaptureRestore (integration)", () => {
	let homeDir: string;
	let workDir: string;
	let originalCwd: string;
	const originalHome = process.env.HOME;
	const originalUserProfile = process.env.USERPROFILE;

	beforeAll(async () => {
		// Create isolated directories
		homeDir = await mkdtemp(join(tmpdir(), "websculpt-int-"));
		workDir = await mkdtemp(join(tmpdir(), "websculpt-int-work-"));

		// Set HOME before importing modules that call homedir()
		process.env.HOME = homeDir;
		process.env.USERPROFILE = homeDir;
		process.env.HOMEDRIVE = undefined;
		process.env.HOMEPATH = undefined;

		originalCwd = process.cwd();
		process.chdir(workDir);

		// Reset module cache so paths.ts re-evaluates homedir()
		vi.resetModules();

		// Import the handler fresh — USER_COMMANDS_DIR will use the isolated home
		const mod = await import("../../../../../src/cli/meta/capture/restore.js");
		handleCaptureRestore = mod.handleCaptureRestore;
	});

	afterAll(async () => {
		process.env.HOME = originalHome;
		process.env.USERPROFILE = originalUserProfile;
		process.chdir(originalCwd);
		try {
			await rm(homeDir, { recursive: true, force: true });
		} catch {
			/* ok */
		}
		try {
			await rm(workDir, { recursive: true, force: true });
		} catch {
			/* ok */
		}
	});

	function buildCaptureYaml(overrides: Record<string, unknown>): string {
		const base: Record<string, unknown> = {
			name: "test-ws",
			domain: "test",
			action: "cmd",
			runtime: "node",
			createdAt: new Date().toISOString(),
			schema: "command-capture",
			commandLibrarySnapshot: {
				totalCommands: 10,
				sameDomainCommands: ["test/cmd"],
				nameConflict: true,
				conflictSource: "user",
			},
			repairOf: null,
			sourceCommand: "test/cmd",
			sourceType: "user",
			supersedes: null,
			...overrides,
		};
		return stringify(base);
	}

	it("replaces existing target directory with backup contents for user restore", async () => {
		const workspaceName = "test-restore-1";
		const domain = "test";
		const action = "collect";

		const workspacePath = join(workDir, ".websculpt", "captures", workspaceName);
		await mkdir(workspacePath, { recursive: true });
		await writeFile(
			join(workspacePath, "capture.yaml"),
			buildCaptureYaml({ name: workspaceName, domain, action, sourceType: "user" }),
			"utf8",
		);

		const backupDir = join(workspacePath, "backup");
		await mkdir(backupDir, { recursive: true });
		await writeFile(
			join(backupDir, "command.js"),
			"export default function() { return 'backup-version'; }\n",
			"utf8",
		);
		await writeFile(join(backupDir, "manifest.json"), JSON.stringify({}), "utf8");

		const targetDir = join(homeDir, ".websculpt", "commands", domain, action);
		await mkdir(targetDir, { recursive: true });
		await writeFile(
			join(targetDir, "command.js"),
			"export default function() { return 'modified-version'; }\n",
			"utf8",
		);

		const result = (await handleCaptureRestore(workspaceName)) as CaptureRestoreResult;
		expect(result.success).toBe(true);
		expect(result.sourceType).toBe("user");
		expect(result.command).toBe("test/collect");

		const restoredContent = await readFile(join(targetDir, "command.js"), "utf8");
		expect(restoredContent).toContain("backup-version");
		expect(restoredContent).not.toContain("modified-version");
	});

	it("creates target directory from backup when it does not exist", async () => {
		const workspaceName = "test-restore-2";
		const domain = "test";
		const action = "create";

		const workspacePath = join(workDir, ".websculpt", "captures", workspaceName);
		await mkdir(workspacePath, { recursive: true });
		await writeFile(
			join(workspacePath, "capture.yaml"),
			buildCaptureYaml({ name: workspaceName, domain, action, sourceType: "user" }),
			"utf8",
		);

		const backupDir = join(workspacePath, "backup");
		await mkdir(backupDir, { recursive: true });
		await writeFile(join(backupDir, "command.js"), "export default function() { return 'fresh-backup'; }\n", "utf8");
		await writeFile(join(backupDir, "manifest.json"), JSON.stringify({}), "utf8");

		const targetDir = join(homeDir, ".websculpt", "commands", domain, action);
		try {
			await rm(targetDir, { recursive: true, force: true });
		} catch {
			// Fine if it doesn't exist
		}

		const result = (await handleCaptureRestore(workspaceName)) as CaptureRestoreResult;
		expect(result.success).toBe(true);
		expect(result.sourceType).toBe("user");

		await expect(access(targetDir)).resolves.toBeUndefined();
		const restoredContent = await readFile(join(targetDir, "command.js"), "utf8");
		expect(restoredContent).toContain("fresh-backup");
	});

	it("removes user override for builtin restore and is idempotent", async () => {
		const workspaceName = "test-restore-3";
		const domain = "test";
		const action = "builtin-cmd";

		const workspacePath = join(workDir, ".websculpt", "captures", workspaceName);
		await mkdir(workspacePath, { recursive: true });
		await writeFile(
			join(workspacePath, "capture.yaml"),
			buildCaptureYaml({ name: workspaceName, domain, action, sourceType: "builtin" }),
			"utf8",
		);

		const backupDir = join(workspacePath, "backup");
		await mkdir(backupDir, { recursive: true });
		await writeFile(join(backupDir, "command.js"), "// backup", "utf8");

		const targetDir = join(homeDir, ".websculpt", "commands", domain, action);
		await mkdir(targetDir, { recursive: true });
		await writeFile(join(targetDir, "command.js"), "// user override", "utf8");
		await writeFile(join(targetDir, "manifest.json"), JSON.stringify({}), "utf8");

		const result1 = (await handleCaptureRestore(workspaceName)) as CaptureRestoreResult;
		expect(result1.success).toBe(true);
		expect(result1.sourceType).toBe("builtin");

		await expect(access(targetDir)).rejects.toMatchObject({ code: "ENOENT" });

		const result2 = (await handleCaptureRestore(workspaceName)) as CaptureRestoreResult;
		expect(result2.success).toBe(true);
		expect(result2.sourceType).toBe("builtin");

		await expect(access(targetDir)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("returns NOT_FOUND for missing workspace", async () => {
		const result = await handleCaptureRestore("nonexistent");
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("NOT_FOUND");
		}
	});

	it("returns WORKSPACE_NOT_RESTORABLE when sourceType is missing", async () => {
		const workspaceName = "test-no-source-type";

		const workspacePath = join(workDir, ".websculpt", "captures", workspaceName);
		await mkdir(workspacePath, { recursive: true });

		await writeFile(
			join(workspacePath, "capture.yaml"),
			buildCaptureYaml({ name: workspaceName, sourceType: undefined }),
			"utf8",
		);

		const backupDir = join(workspacePath, "backup");
		await mkdir(backupDir, { recursive: true });
		await writeFile(join(backupDir, "command.js"), "// backup", "utf8");

		const result = await handleCaptureRestore(workspaceName);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("WORKSPACE_NOT_RESTORABLE");
		}
	});

	it("returns BACKUP_NOT_FOUND when backup directory is missing", async () => {
		const workspaceName = "test-no-backup";

		const workspacePath = join(workDir, ".websculpt", "captures", workspaceName);
		await mkdir(workspacePath, { recursive: true });

		await writeFile(
			join(workspacePath, "capture.yaml"),
			buildCaptureYaml({ name: workspaceName, sourceType: "builtin" }),
			"utf8",
		);

		const result = await handleCaptureRestore(workspaceName);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.code).toBe("BACKUP_NOT_FOUND");
		}
	});
});
