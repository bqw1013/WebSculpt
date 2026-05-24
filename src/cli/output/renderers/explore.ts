import { printKeyValue } from "../formatters.js";
import type {
	ExploreAssessFailedResult,
	ExploreAssessPassedResult,
	ExploreAssessResult,
	ExploreNewResult,
	MetaCommandResult,
} from "../types.js";

export function isExploreNewResult(r: MetaCommandResult): r is ExploreNewResult {
	return r.success && "explore" in r && "intent" in r.explore;
}

export function renderExploreNewResult(result: ExploreNewResult): void {
	console.log(`Explore workspace created at ${result.explore.path}`);
	console.log("");
	printKeyValue("name:", result.explore.name);
	printKeyValue("intent:", result.explore.intent);
	console.log("");
	console.log(`Next: ${result.next}`);
}

export function isExploreAssessResult(r: MetaCommandResult): r is ExploreAssessResult {
	return "explore" in r && ("assessment" in r || "audit" in r);
}

export function renderExploreAssessResult(result: ExploreAssessResult): void {
	if (!result.success) {
		renderExploreAssessFailedResult(result);
		return;
	}
	renderExploreAssessPassedResult(result);
}

function renderExploreAssessFailedResult(result: ExploreAssessFailedResult): void {
	console.log(`Explore assessment failed for ${result.explore.name}`);
	console.log("");
	printKeyValue("code:", result.error.code);
	printKeyValue("reason:", result.error.message);
	if (result.audit.missingHeadings.length > 0) {
		printKeyValue("missing headings:", result.audit.missingHeadings.join(", "));
	}
	if (result.audit.emptyHeadings.length > 0) {
		printKeyValue("empty headings:", result.audit.emptyHeadings.join(", "));
	}
	if (result.audit.keywordGaps.length > 0) {
		printKeyValue("keyword gaps:", result.audit.keywordGaps.join(", "));
	}
}

function renderExploreAssessPassedResult(result: ExploreAssessPassedResult): void {
	console.log(`Explore assessment for ${result.explore.name}`);
	console.log(`Workspace: ${result.explore.path}`);
	console.log("");
	printKeyValue("status:", result.assessment.status);
	printKeyValue("capture eligible:", result.assessment.captureEligible ? "yes" : "no");
	if (result.assessment.candidate !== undefined) {
		printKeyValue("candidate:", result.assessment.candidate);
	}
	console.log("");
	console.log(`Next: ${result.next}`);
}
