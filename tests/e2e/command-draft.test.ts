import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createIsolatedHome,
	parseJsonOutput,
	readJsonFile,
	removeTempDir,
	runSourceCli,
} from "./helpers/cli";

async function cleanupDrafts(): Promise<void> {
	try {
		await rm(resolve(".websculpt-drafts"), { recursive: true, force: true });
	} catch {
		// ignore
	}
}

describe("command draft", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
		await cleanupDrafts();
	});

	it("creates four files with correct structure for default runtime", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const result = await runSourceCli(
			["command", "draft", "example", "hello", "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{
			success: boolean;
			draftPath: string;
			files: string[];
			runtime: string;
		}>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.runtime).toBe("node");
		expect(payload.files).toContain("manifest.json");
		expect(payload.files).toContain("command.js");
		expect(payload.files).toContain("README.md");
		expect(payload.files).toContain("context.md");

		const manifest = await readJsonFile<{ runtime: string }>(join(payload.draftPath, "manifest.json"));
		expect(manifest.runtime).toBe("node");

		const code = await readFile(join(payload.draftPath, "command.js"), "utf-8");
		expect(code).toContain("export default async function");
		expect(code).toContain("/* PARAMS_INJECT */");
	});

	it("produces function-body syntax without module keywords for playwright-cli runtime", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const result = await runSourceCli(
			["command", "draft", "zhihu", "articles", "--runtime", "playwright-cli", "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{
			success: boolean;
			draftPath: string;
			runtime: string;
		}>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.runtime).toBe("playwright-cli");

		const manifest = await readJsonFile<{ runtime: string }>(join(payload.draftPath, "manifest.json"));
		expect(manifest.runtime).toBe("playwright-cli");

		const code = await readFile(join(payload.draftPath, "command.js"), "utf-8");
		expect(code).toContain("async function (page)");
		expect(code).toContain("/* PARAMS_INJECT */");
		expect(code).not.toContain("export");
		expect(code).not.toContain("import");
	});

	it("pre-fills manifest parameters and command.js variable assignments with --param", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const result = await runSourceCli(
			[
				"command",
				"draft",
				"paramtest",
				"cmd",
				"--runtime",
				"playwright-cli",
				"--param",
				"author:required",
				"--param",
				"limit:default=10",
				"--format",
				"json",
			],
			homeDir,
		);
		const payload = parseJsonOutput<{
			success: boolean;
			draftPath: string;
		}>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);

		const manifest = await readJsonFile<{
			parameters: Array<{ name: string; required?: boolean; default?: unknown }>;
		}>(join(payload.draftPath, "manifest.json"));

		expect(manifest.parameters).toHaveLength(2);
		expect(manifest.parameters[0]).toEqual({ name: "author", required: true });
		expect(manifest.parameters[1]).toEqual({ name: "limit", required: false, default: 10 });

		const code = await readFile(join(payload.draftPath, "command.js"), "utf-8");
		expect(code).toContain("const author = params.author;");
		expect(code).toContain("const limit = parseInt(params.limit, 10);");
	});

	it("is consumable by command create --from-dir without validation errors", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const draftResult = await runSourceCli(
			["command", "draft", "test", "cmd", "--runtime", "node", "--format", "json"],
			homeDir,
		);
		const draftPayload = parseJsonOutput<{
			success: boolean;
			draftPath: string;
		}>(draftResult.stdout);
		expect(draftResult.exitCode).toBe(0);
		expect(draftPayload.success).toBe(true);

		// Fill description before create, since draft generates an empty placeholder.
		const manifestPath = join(draftPayload.draftPath, "manifest.json");
		const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
		manifest.description = "A test command description";
		await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

		const createResult = await runSourceCli(
			[
				"command",
				"create",
				"test",
				"cmd",
				"--from-dir",
				draftPayload.draftPath,
				"--format",
				"json",
			],
			homeDir,
		);
		const createPayload = parseJsonOutput<{
			success: boolean;
			command?: string;
			error?: { code: string };
		}>(createResult.stdout);

		expect(createResult.exitCode).toBe(0);
		expect(createPayload.success).toBe(true);
		expect(createPayload.command).toBe("test/cmd");
	});

	it("rejects existing directory without --force and overwrites with --force", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const draftDir = resolve(homeDir, ".websculpt-drafts", "example-hello");

		// First draft
		const firstResult = await runSourceCli(
			["command", "draft", "example", "hello", "--format", "json"],
			homeDir,
		);
		const firstPayload = parseJsonOutput<{
			success: boolean;
			draftPath: string;
		}>(firstResult.stdout);
		expect(firstResult.exitCode).toBe(0);
		expect(firstPayload.success).toBe(true);

		// Second draft without --force should fail
		const secondResult = await runSourceCli(
			["command", "draft", "example", "hello", "--format", "json"],
			homeDir,
		);
		const secondPayload = parseJsonOutput<{
			success: boolean;
			error?: { code: string };
		}>(secondResult.stdout);

		expect(secondResult.exitCode).toBe(0);
		expect(secondPayload.success).toBe(false);
		expect(secondPayload.error?.code).toBe("ALREADY_EXISTS");

		// Third draft with --force should succeed
		const thirdResult = await runSourceCli(
			["command", "draft", "example", "hello", "--force", "--format", "json"],
			homeDir,
		);
		const thirdPayload = parseJsonOutput<{
			success: boolean;
		}>(thirdResult.stdout);

		expect(thirdResult.exitCode).toBe(0);
		expect(thirdPayload.success).toBe(true);
	});

	it("returns expected nextSteps array in JSON mode", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const result = await runSourceCli(
			["command", "draft", "nextstep", "test", "--format", "json"],
			homeDir,
		);
		const payload = parseJsonOutput<{
			success: boolean;
			nextSteps: Array<{ action: string; file?: string; command?: string }>;
		}>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.nextSteps.length).toBeGreaterThan(0);
		expect(payload.nextSteps.some((s) => s.action.includes("Edit"))).toBe(true);
		expect(payload.nextSteps.some((s) => s.command?.includes("validate"))).toBe(true);
		expect(payload.nextSteps.some((s) => s.command?.includes("create"))).toBe(true);
	});
});
