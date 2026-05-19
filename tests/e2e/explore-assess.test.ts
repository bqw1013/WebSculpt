import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createIsolatedHome, parseJsonOutput, removeTempDir, runSourceCli } from "./helpers/cli";

interface ExploreAssessPayload {
	explore?: {
		name: string;
		path: string;
	};
	assessment?: {
		status: string;
		captureEligible: boolean;
		candidate?: string;
	};
	audit?: {
		missingHeadings: string[];
		emptyHeadings: string[];
		keywordGaps: string[];
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
	schema: string;
	assessment?: {
		status: string;
		captureEligible: boolean;
		candidate?: string;
		timestamp: string;
	};
}

describe("explore assess", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("passes for a complete trace with candidate", async () => {
		const { homeDir, workDir } = await createExploreTestDirs(tempDirs);
		await createExploreWorkspace(homeDir, workDir, "with-candidate");
		await writeTraceMd(workDir, "with-candidate", completeTrace("Candidate: example/collect"));

		const result = await runExploreAssess(homeDir, workDir, ["with-candidate"]);
		const payload = parseJsonOutput<ExploreAssessPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.assessment?.status).toBe("passed");
		expect(payload.assessment?.captureEligible).toBe(true);
		expect(payload.assessment?.candidate).toBe("example/collect");
		expect(payload.next).toContain("capture new");

		const exploreYaml = await readExploreYaml(workDir, "with-candidate");
		expect(exploreYaml.assessment?.status).toBe("passed");
		expect(exploreYaml.assessment?.captureEligible).toBe(true);
		expect(exploreYaml.assessment?.candidate).toBe("example/collect");
	});

	it("passes for a trace with no candidate", async () => {
		const { homeDir, workDir } = await createExploreTestDirs(tempDirs);
		await createExploreWorkspace(homeDir, workDir, "no-candidate");
		await writeTraceMd(workDir, "no-candidate", completeTrace("No candidate identified"));

		const result = await runExploreAssess(homeDir, workDir, ["no-candidate"]);
		const payload = parseJsonOutput<ExploreAssessPayload>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(payload.success).toBe(true);
		expect(payload.assessment?.status).toBe("passed");
		expect(payload.assessment?.captureEligible).toBe(false);
		expect(payload.next).toContain("No candidate identified");

		const exploreYaml = await readExploreYaml(workDir, "no-candidate");
		expect(exploreYaml.assessment?.status).toBe("passed");
		expect(exploreYaml.assessment?.captureEligible).toBe(false);
	});

	it("fails when a required heading is missing", async () => {
		const { homeDir, workDir } = await createExploreTestDirs(tempDirs);
		await createExploreWorkspace(homeDir, workDir, "missing-heading");
		const trace = completeTrace("No candidate identified").replace("## Library Check\nChecked command list.\n\n", "");
		await writeTraceMd(workDir, "missing-heading", trace);

		const result = await runExploreAssess(homeDir, workDir, ["missing-heading"]);
		const payload = parseJsonOutput<ExploreAssessPayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("EXPLORE_AUDIT_FAILED");
		expect(payload.audit?.missingHeadings).toContain("Library Check");

		const exploreYaml = await readExploreYaml(workDir, "missing-heading");
		expect(exploreYaml.assessment).toBeUndefined();
	});

	it("fails when a heading is empty", async () => {
		const { homeDir, workDir } = await createExploreTestDirs(tempDirs);
		await createExploreWorkspace(homeDir, workDir, "empty-heading");
		const trace = completeTrace("").replace("## Assessment\nNo candidate identified", "## Assessment\n");
		await writeTraceMd(workDir, "empty-heading", trace);

		const result = await runExploreAssess(homeDir, workDir, ["empty-heading"]);
		const payload = parseJsonOutput<ExploreAssessPayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("EXPLORE_AUDIT_FAILED");
		expect(payload.audit?.emptyHeadings).toContain("Assessment");
	});

	it("fails when no verified URL is present", async () => {
		const { homeDir, workDir } = await createExploreTestDirs(tempDirs);
		await createExploreWorkspace(homeDir, workDir, "no-url");
		const trace = completeTrace("No candidate identified").replace("https://example.com/api", "searched online");
		await writeTraceMd(workDir, "no-url", trace);

		const result = await runExploreAssess(homeDir, workDir, ["no-url"]);
		const payload = parseJsonOutput<ExploreAssessPayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("NO_VERIFIED_URL");
		expect(payload.audit?.keywordGaps).toContain("verified-urls");
	});

	it("fails when browser runtime lacks guide.md acknowledgment", async () => {
		const { homeDir, workDir } = await createExploreTestDirs(tempDirs);
		await createExploreWorkspace(homeDir, workDir, "no-guide");
		const trace = completeTrace("No candidate identified").replace(
			"## Tool Trace\nUsed REST API.",
			"## Tool Trace\nUsed Playwright to automate browser.",
		);
		await writeTraceMd(workDir, "no-guide", trace);

		const result = await runExploreAssess(homeDir, workDir, ["no-guide"]);
		const payload = parseJsonOutput<ExploreAssessPayload>(result.stdout);

		expect(result.exitCode).toBe(1);
		expect(payload.success).toBe(false);
		expect(payload.error?.code).toBe("GUIDE_NOT_ACKNOWLEDGED");
		expect(payload.audit?.keywordGaps).toContain("guide-read");
	});
});

async function createExploreTestDirs(tempDirs: string[]): Promise<{ homeDir: string; workDir: string }> {
	const homeDir = await createIsolatedHome();
	const workDir = await createIsolatedHome();
	tempDirs.push(homeDir, workDir);
	return { homeDir, workDir };
}

async function createExploreWorkspace(homeDir: string, workDir: string, name: string): Promise<void> {
	await runSourceCli(["explore", "new", name, "--intent", "test intent", "--format", "json"], homeDir, {
		cwd: workDir,
	});
}

async function writeTraceMd(workDir: string, name: string, content: string): Promise<void> {
	await writeFile(join(workDir, ".websculpt/explores", name, "trace.md"), content, "utf8");
}

async function readExploreYaml(workDir: string, name: string): Promise<ExploreYaml> {
	const raw = await readFile(join(workDir, ".websculpt/explores", name, "explore.yaml"), "utf8");
	return parse(raw) as ExploreYaml;
}

async function runExploreAssess(homeDir: string, workDir: string, args: string[]) {
	return await runSourceCli(["explore", "assess", ...args, "--format", "json"], homeDir, { cwd: workDir });
}

function completeTrace(assessmentContent: string): string {
	return `## Library Check
Checked command list.

## Tool Trace
Used REST API.

## Protocol
Followed REST conventions.

## Verified Sources
https://example.com/api

## Assessment
${assessmentContent}
`;
}
