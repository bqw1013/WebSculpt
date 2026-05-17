import { describe, expect, it } from "vitest";
import { auditTrace, parseAssessmentCandidate } from "../../../../../../src/cli/meta/explore/lib/explore-audit.js";

describe("auditTrace", () => {
	it("passes for a complete trace with candidate", () => {
		const content = `## Library Check
Checked command list. Found no existing commands.

## Tool Trace
Used REST API.

## Protocol
Followed REST conventions.

## Verified Sources
https://example.com/api

## Assessment
Scenario: collect daily metrics.
Candidate: metrics/collect
Runtime: node
Parameters: date
Output schema: { count: number }
Prerequisites: none
Rationale: automates manual workflow.
Reuse conclusion: none applicable.
`;

		const result = auditTrace(content);

		expect(result.passed).toBe(true);
		expect(result.missingHeadings).toEqual([]);
		expect(result.emptyHeadings).toEqual([]);
		expect(result.keywordGaps).toEqual([]);
	});

	it("fails when a required heading is missing", () => {
		const content = `## Tool Trace
Used REST API.

## Protocol
Followed REST conventions.

## Verified Sources
https://example.com/api

## Assessment
No candidate identified.
`;

		const result = auditTrace(content);

		expect(result.passed).toBe(false);
		expect(result.missingHeadings).toEqual(["Library Check"]);
		expect(result.emptyHeadings).toEqual([]);
	});

	it("fails when a heading is empty", () => {
		const content = `## Library Check

## Tool Trace
Used REST API.

## Protocol
Followed REST conventions.

## Verified Sources
https://example.com/api

## Assessment
No candidate identified.
`;

		const result = auditTrace(content);

		expect(result.passed).toBe(false);
		expect(result.missingHeadings).toEqual([]);
		expect(result.emptyHeadings).toEqual(["Library Check"]);
	});

	it("fails when no verified URL is present", () => {
		const content = `## Library Check
Checked command list.

## Tool Trace
Used REST API.

## Protocol
Followed REST conventions.

## Verified Sources
Only searched, no verified page.

## Assessment
No candidate identified.
`;

		const result = auditTrace(content);

		expect(result.passed).toBe(false);
		expect(result.keywordGaps).toContain("verified-urls");
		expect(result.code).toBe("NO_VERIFIED_URL");
	});

	it("fails when browser runtime lacks guide.md acknowledgment", () => {
		const content = `## Library Check
Checked command list.

## Tool Trace
Used Playwright to automate browser.

## Protocol
Navigate and scrape.

## Verified Sources
https://example.com/page

## Assessment
No candidate identified.
`;

		const result = auditTrace(content);

		expect(result.passed).toBe(false);
		expect(result.keywordGaps).toContain("guide-read");
		expect(result.code).toBe("GUIDE_NOT_ACKNOWLEDGED");
	});

	it("passes for browser runtime when guide.md is acknowledged", () => {
		const content = `## Library Check
Checked command list.

## Tool Trace
Used Playwright.

## Protocol
Read guide.md for browser automation workflow.

## Verified Sources
https://example.com/page

## Assessment
No candidate identified.
`;

		const result = auditTrace(content);

		expect(result.passed).toBe(true);
		expect(result.keywordGaps).toEqual([]);
	});
});

describe("parseAssessmentCandidate", () => {
	it("returns no-candidate when explicitly stated", () => {
		const content = "No candidate identified";
		expect(parseAssessmentCandidate(content)).toBe("no-candidate");
	});

	it("returns candidate when domain/action pattern is found", () => {
		const content = "Candidate: metrics/collect";
		expect(parseAssessmentCandidate(content)).toBe("metrics/collect");
	});

	it("returns undefined for ambiguous content", () => {
		const content = "Maybe something useful.";
		expect(parseAssessmentCandidate(content)).toBeUndefined();
	});
});
