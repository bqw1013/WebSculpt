import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import type { ExploreAssessFailedResult, ExploreAssessPassedResult, MetaCommandResult } from "../../output.js";
import { renderOutput } from "../../output.js";
import { auditTrace, parseAssessmentCandidate } from "./lib/explore-audit.js";
import { getExploreWorkspacePath, readExploreYaml, readTraceMd, writeExploreYaml } from "./lib/explore-io.js";

/**
 * Audits an explore workspace's trace.md and persists the result to explore.yaml.
 */
export async function handleExploreAssess(name: string): Promise<MetaCommandResult> {
	try {
		const workspacePath = getExploreWorkspacePath(name);

		try {
			await access(workspacePath, constants.F_OK);
		} catch (err: unknown) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code === "ENOENT") {
				return {
					success: false,
					error: {
						code: "NOT_FOUND",
						message: `Explore workspace not found: ${workspacePath}`,
					},
				};
			}
			throw err;
		}

		const traceContent = await readTraceMd(workspacePath);
		if (traceContent === undefined) {
			return {
				success: false,
				error: {
					code: "EXPLORE_AUDIT_FAILED",
					message: "trace.md is missing",
				},
			};
		}

		const audit = auditTrace(traceContent);

		if (!audit.passed) {
			let message = "Audit failed";
			if (audit.missingHeadings.length > 0) {
				message += `; missing headings: ${audit.missingHeadings.join(", ")}`;
			}
			if (audit.emptyHeadings.length > 0) {
				message += `; empty headings: ${audit.emptyHeadings.join(", ")}`;
			}
			if (audit.keywordGaps.length > 0) {
				message += `; keyword gaps: ${audit.keywordGaps.join(", ")}`;
			}

			const errorCode = audit.code ?? "EXPLORE_AUDIT_FAILED";
			const result: ExploreAssessFailedResult = {
				success: false,
				explore: {
					name,
					path: workspacePath,
				},
				error: {
					code: errorCode,
					message,
				},
				audit: {
					missingHeadings: audit.missingHeadings,
					emptyHeadings: audit.emptyHeadings,
					keywordGaps: audit.keywordGaps,
				},
			};
			return result;
		}

		// Parse Assessment section for candidate/no-candidate
		const contentWithoutComments = traceContent.replace(/<!--[\s\S]*?-->/g, "");
		const assessmentMatch = contentWithoutComments.match(/##\s+Assessment\n+([\s\S]*?)(?=\n##\s|$)/);
		let captureEligible = false;
		let candidate: string | undefined;

		if (assessmentMatch?.[1]) {
			const assessmentContent = assessmentMatch[1].trim();
			const parsed = parseAssessmentCandidate(assessmentContent);
			if (parsed === "no-candidate") {
				captureEligible = false;
			} else if (parsed !== undefined) {
				captureEligible = true;
				candidate = parsed;
			}
		}

		// Persist assessment to explore.yaml
		const exploreYamlPath = join(workspacePath, "explore.yaml");
		const metadata = await readExploreYaml(exploreYamlPath);
		metadata.assessment = {
			status: "passed",
			captureEligible,
			candidate,
			timestamp: new Date().toISOString(),
		};
		await writeExploreYaml(exploreYamlPath, metadata);

		const result: ExploreAssessPassedResult = {
			success: true,
			explore: {
				name,
				path: workspacePath,
			},
			assessment: {
				status: "passed",
				captureEligible,
				candidate,
			},
			next: captureEligible
				? `Candidate command identified: ${candidate}. Proceed to "websculpt capture new".`
				: "No candidate identified. Explore phase complete without capture.",
		};
		return result;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: { code: "EXPLORE_ASSESS_ERROR", message },
		};
	}
}

/** Registers the `explore assess` sub-command on the explore command group. */
export function registerExploreAssess(group: Command, format: () => "human" | "json"): void {
	group
		.command("assess <name>")
		.description("Audit an explore workspace's trace.md")
		.action(async (name: string) => {
			renderOutput(await handleExploreAssess(name), format());
		});
}
