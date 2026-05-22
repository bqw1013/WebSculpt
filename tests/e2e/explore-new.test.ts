import { access, constants, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createIsolatedHome, parseJsonOutput, removeTempDir, runSourceCli } from "./helpers/cli";

interface ExploreNewPayload {
	explore?: {
		name: string;
		path: string;
		intent: string;
	};
	error?: {
		code: string;
		message: string;
	};
	next?: string;
	success: boolean;
}

interface ExploreYaml {
	name: string;
	intent: string;
	createdAt: string;
	schema: string;
}

describe("explore new", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("creates an explore workspace with metadata and trace template", async () => {
		const { homeDir, workDir } = await createExploreTestDirs(tempDirs);

		const result = await runExploreNew(homeDir, workDir, ["producthunt-today", "--intent", "查 ProductHunt 热榜"]);
		const payload = parseJsonOutput<ExploreNewPayload>(result.stdout);
		const workspacePath = join(workDir, ".websculpt/explores", "producthunt-today");

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.explore).toEqual(
			expect.objectContaining({
				name: "producthunt-today",
				path: workspacePath,
				intent: "查 ProductHunt 热榜",
			}),
		);
		expect(payload.next).toBe("websculpt explore assess producthunt-today");

		await expect(access(join(workspacePath, "explore.yaml"), constants.F_OK)).resolves.toBeUndefined();
		await expect(access(join(workspacePath, "trace.md"), constants.F_OK)).resolves.toBeUndefined();

		const exploreYaml = parse(await readFile(join(workspacePath, "explore.yaml"), "utf8")) as ExploreYaml;
		expect(exploreYaml).toEqual(
			expect.objectContaining({
				name: "producthunt-today",
				intent: "查 ProductHunt 热榜",
				schema: "explore-trace",
			}),
		);
		expect(Date.parse(exploreYaml.createdAt)).not.toBeNaN();

		const trace = await readFile(join(workspacePath, "trace.md"), "utf8");
		expect(trace).toContain("## Library Check");
		expect(trace).toContain("## Tool Trace");
		expect(trace).toContain("## Protocol");
		expect(trace).toContain("## Verified Sources");
		expect(trace).toContain("## Assessment");
		expect(trace).toContain("### Scenario");
		expect(trace).toContain("### Candidate");
		expect(trace).toContain("### Runtime");
		expect(trace).toContain("### Parameters");
		expect(trace).toContain("### Output Schema");
		expect(trace).toContain("### Command Library Relation");
		expect(trace).toContain("### Prerequisites");
		expect(trace).toContain("### Confirmation");
		expect(trace).toContain("<!--");
	});

	it("rejects invalid explore names", async () => {
		const { homeDir, workDir } = await createExploreTestDirs(tempDirs);

		const spaceResult = await runExploreNew(homeDir, workDir, ["my explore", "--intent", "test"]);
		const uppercaseResult = await runExploreNew(homeDir, workDir, ["MyExplore", "--intent", "test"]);

		expect(parseJsonOutput<ExploreNewPayload>(spaceResult.stdout).error?.code).toBe("INVALID_EXPLORE_NAME");
		expect(parseJsonOutput<ExploreNewPayload>(uppercaseResult.stdout).error?.code).toBe("INVALID_EXPLORE_NAME");
	});

	it("rejects duplicate workspace names without force", async () => {
		const { homeDir, workDir } = await createExploreTestDirs(tempDirs);

		const firstResult = await runExploreNew(homeDir, workDir, ["existing-explore", "--intent", "first"]);
		const secondResult = await runExploreNew(homeDir, workDir, ["existing-explore", "--intent", "second"]);
		const payload = parseJsonOutput<ExploreNewPayload>(secondResult.stdout);

		expect(parseJsonOutput<ExploreNewPayload>(firstResult.stdout).success).toBe(true);
		expect(secondResult.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("EXPLORE_ALREADY_EXISTS");
	});

	it("overwrites an existing workspace with force", async () => {
		const { homeDir, workDir } = await createExploreTestDirs(tempDirs);

		const firstResult = await runExploreNew(homeDir, workDir, ["force-explore", "--intent", "first"]);
		const workspacePath = join(workDir, ".websculpt/explores", "force-explore");

		const secondResult = await runExploreNew(homeDir, workDir, ["force-explore", "--intent", "second", "--force"]);
		const payload = parseJsonOutput<ExploreNewPayload>(secondResult.stdout);

		expect(parseJsonOutput<ExploreNewPayload>(firstResult.stdout).success).toBe(true);
		expect(secondResult.exitCode).toBe(0);
		expect(payload.success).toBe(true);

		const exploreYaml = parse(await readFile(join(workspacePath, "explore.yaml"), "utf8")) as ExploreYaml;
		expect(exploreYaml.intent).toBe("second");
	});
});

async function createExploreTestDirs(tempDirs: string[]): Promise<{ homeDir: string; workDir: string }> {
	const homeDir = await createIsolatedHome();
	const workDir = await createIsolatedHome();
	tempDirs.push(homeDir, workDir);
	return { homeDir, workDir };
}

async function runExploreNew(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["explore", "new", ...args, "--format", "json"], homeDir, { cwd: workDir });
}
