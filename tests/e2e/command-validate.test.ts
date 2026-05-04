import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedHome, parseJsonOutput, removeTempDir, runSourceCli } from "./helpers/cli";
import { notesSavePackage, reservedSyncPackage, writeCommandDir } from "./helpers/commands";

describe("command validate", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("returns success for a valid directory in preflight mode", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const commandDirPath = await writeCommandDir(homeDir, "validate-ok-dir", notesSavePackage);
		const result = await runSourceCli(
			["command", "validate", "--from-dir", commandDirPath, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{ success: boolean; warnings?: Array<{ code: string; level: string }> }>(
			result.stdout,
		);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
	});

	it("returns MISSING_IDENTITY_FIELDS warning in preflight mode when manifest lacks identity fields", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const partialManifest = {
			code: "export default async function() { return { ok: true }; }\n",
			manifest: {
				description: "Partial manifest",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			},
		};
		const commandDirPath = await writeCommandDir(
			homeDir,
			"partial-dir",
			partialManifest as unknown as Parameters<typeof writeCommandDir>[2],
		);
		const result = await runSourceCli(
			["command", "validate", "--from-dir", commandDirPath, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{ success: boolean; warnings?: Array<{ code: string; level: string }> }>(
			result.stdout,
		);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.warnings).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "MISSING_IDENTITY_FIELDS", level: "warning" })]),
		);
	});

	it("returns MISSING_README and MISSING_CONTEXT warnings for an otherwise valid package in preflight mode", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const commandDirPath = await writeCommandDir(homeDir, "no-assets-dir", notesSavePackage);
		const result = await runSourceCli(
			["command", "validate", "--from-dir", commandDirPath, "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{ success: boolean; warnings?: Array<{ code: string; level: string }> }>(
			result.stdout,
		);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "MISSING_README", level: "warning" }),
				expect.objectContaining({ code: "MISSING_CONTEXT", level: "warning" }),
			]),
		);
	});

	it("treats missing identity fields as warnings in injection-simulation mode", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const partialManifest = {
			code: "export default async function() { return { ok: true }; }\n",
			manifest: {
				description: "Partial manifest",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			},
		};
		const commandDirPath = await writeCommandDir(
			homeDir,
			"partial-sim-dir",
			partialManifest as unknown as Parameters<typeof writeCommandDir>[2],
		);
		const result = await runSourceCli(
			["command", "validate", "--from-dir", commandDirPath, "testdomain", "testaction", "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{ success: boolean; warnings?: Array<{ code: string; level: string }> }>(
			result.stdout,
		);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.warnings).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "MISSING_IDENTITY_FIELDS", level: "warning" })]),
		);
	});

	it("returns ID_MISMATCH error when manifest id does not match injected domain-action", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const mismatchedPackage = {
			code: "export default async function() { return { ok: true }; }\n",
			manifest: {
				action: "action",
				description: "Mismatched id",
				domain: "domain",
				id: "domain-wrong",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			},
		};
		const commandDirPath = await writeCommandDir(homeDir, "mismatch-id-dir", mismatchedPackage);
		const result = await runSourceCli(
			["command", "validate", "--from-dir", commandDirPath, "domain", "action", "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{
			success: boolean;
			error?: { code: string; details?: Array<{ code: string; level: string }> };
		}>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("VALIDATION_ERROR");
		expect(payload.error?.details).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "ID_MISMATCH", level: "error" })]),
		);
	});

	it("returns ID_MISMATCH error when manifest domain does not match provided domain", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const mismatchedPackage = {
			code: "export default async function() { return { ok: true }; }\n",
			manifest: {
				action: "action",
				description: "Mismatched domain",
				domain: "wrongdomain",
				id: "wrongdomain-action",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			},
		};
		const commandDirPath = await writeCommandDir(homeDir, "mismatch-domain-dir", mismatchedPackage);
		const result = await runSourceCli(
			["command", "validate", "--from-dir", commandDirPath, "rightdomain", "action", "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{
			success: boolean;
			error?: { code: string; details?: Array<{ code: string; level: string }> };
		}>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("VALIDATION_ERROR");
		expect(payload.error?.details).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "ID_MISMATCH", level: "error" })]),
		);
	});

	it("rejects reserved domain 'config' with RESERVED_DOMAIN in injection-simulation mode", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const commandDirPath = await writeCommandDir(homeDir, "validate-config-dir", reservedSyncPackage);
		const result = await runSourceCli(
			["command", "validate", "--from-dir", commandDirPath, "config", "sync", "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{ success: boolean; error?: { code: string } }>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("RESERVED_DOMAIN");
	});

	it("aggregates L1, L2, and L3 errors into a single VALIDATION_ERROR response", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const badPackage = {
			code: "async function() { return e1; }",
			manifest: {
				action: "bad",
				description: "Bad command",
				domain: "bad-domain",
				id: "bad-domain-wrong-id",
				parameters: [],
				runtime: "node",
				requiresBrowser: false,
			},
		};
		const commandDirPath = await writeCommandDir(homeDir, "multi-error-dir", badPackage);
		const result = await runSourceCli(
			["command", "validate", "--from-dir", commandDirPath, "bad-domain", "bad", "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{
			success: boolean;
			error?: { code: string; details?: Array<{ code: string; level: string }> };
		}>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("VALIDATION_ERROR");

		const details = payload.error?.details ?? [];
		const codes = details.map((d) => d.code);

		// L1 structure error
		expect(codes).toContain("ID_MISMATCH");

		// L2 compliance error
		expect(codes).toContain("TEMP_REF_FOUND");

		// L3 contract error
		expect(codes).toContain("MISSING_EXPORT_DEFAULT");
	});
});
