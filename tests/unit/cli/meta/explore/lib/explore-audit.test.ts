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
### Scenario
collect daily metrics.

### Candidate
metrics/collect

### Runtime
node

### Parameters
date

### Output Schema
{ count: number }

### Command Library Relation
New command.

### Prerequisites
none

### Confirmation
User agreed to proceed.
`;

		const result = auditTrace(content);

		expect(result.passed).toBe(true);
		expect(result.missingHeadings).toEqual([]);
		expect(result.emptyHeadings).toEqual([]);
		expect(result.keywordGaps).toEqual([]);
		expect(result.missingSubHeadings).toEqual([]);
		expect(result.emptySubHeadings).toEqual([]);
	});

	it("fails when a required heading is missing", () => {
		const content = `## Tool Trace
Used REST API.

## Protocol
Followed REST conventions.

## Verified Sources
https://example.com/api

## Assessment
### Scenario
Explored API.

### Candidate
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
### Scenario
Explored API.

### Candidate
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
### Scenario
Explored API.

### Candidate
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
### Scenario
Explored API.

### Candidate
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
### Scenario
Explored API.

### Candidate
No candidate identified.
`;

		const result = auditTrace(content);

		expect(result.passed).toBe(true);
		expect(result.keywordGaps).toEqual([]);
	});

	it("passes for candidate path with all 8 H3 subsections present and non-empty", () => {
		const content = `## Library Check
Checked.

## Tool Trace
Used API.

## Protocol
REST.

## Verified Sources
https://example.com

## Assessment
### Scenario
Daily metrics.

### Candidate
metrics/collect

### Runtime
node

### Parameters
date

### Output Schema
{ count: number }

### Command Library Relation
New.

### Prerequisites
none

### Confirmation
User agreed.
`;

		const result = auditTrace(content);
		expect(result.passed).toBe(true);
		expect(result.missingSubHeadings).toEqual([]);
		expect(result.emptySubHeadings).toEqual([]);
	});

	it("fails for candidate path missing Confirmation", () => {
		const content = `## Library Check
Checked.

## Tool Trace
Used API.

## Protocol
REST.

## Verified Sources
https://example.com

## Assessment
### Scenario
Daily metrics.

### Candidate
metrics/collect

### Runtime
node

### Parameters
date

### Output Schema
{ count: number }

### Command Library Relation
New.

### Prerequisites
none
`;

		const result = auditTrace(content);
		expect(result.passed).toBe(false);
		expect(result.missingSubHeadings).toContain("Confirmation");
		expect(result.code).toBe("CONFIRMATION_MISSING");
	});

	it("fails for candidate path with empty Parameters", () => {
		const content = `## Library Check
Checked.

## Tool Trace
Used API.

## Protocol
REST.

## Verified Sources
https://example.com

## Assessment
### Scenario
Daily metrics.

### Candidate
metrics/collect

### Runtime
node

### Parameters

### Output Schema
{ count: number }

### Command Library Relation
New.

### Prerequisites
none

### Confirmation
User agreed.
`;

		const result = auditTrace(content);
		expect(result.passed).toBe(false);
		expect(result.emptySubHeadings).toContain("Parameters");
		expect(result.code).toBe("ASSESSMENT_INCOMPLETE");
	});

	it("passes for no-candidate path with only Scenario and Candidate", () => {
		const content = `## Library Check
Checked.

## Tool Trace
Used API.

## Protocol
REST.

## Verified Sources
https://example.com

## Assessment
### Scenario
One-off query.

### Candidate
No candidate identified.
`;

		const result = auditTrace(content);
		expect(result.passed).toBe(true);
		expect(result.missingSubHeadings).toEqual([]);
		expect(result.emptySubHeadings).toEqual([]);
	});

	it("fails for ambiguous Candidate content", () => {
		const content = `## Library Check
Checked.

## Tool Trace
Used API.

## Protocol
REST.

## Verified Sources
https://example.com

## Assessment
### Scenario
Daily metrics.

### Candidate
Maybe something useful.
`;

		const result = auditTrace(content);
		expect(result.passed).toBe(false);
		expect(result.code).toBe("INVALID_CANDIDATE_FORMAT");
	});
});

describe("parseAssessmentCandidate", () => {
	it("returns no-candidate when explicitly stated in H3", () => {
		const content = "### Candidate\nNo candidate identified";
		expect(parseAssessmentCandidate(content)).toBe("no-candidate");
	});

	it("returns candidate when domain/action pattern is in H3", () => {
		const content = "### Candidate\nmetrics/collect";
		expect(parseAssessmentCandidate(content)).toBe("metrics/collect");
	});

	it("returns undefined for ambiguous H3 content", () => {
		const content = "### Candidate\nMaybe something useful.";
		expect(parseAssessmentCandidate(content)).toBeUndefined();
	});

	it("returns no-candidate from flat text without H3 heading", () => {
		expect(parseAssessmentCandidate("No candidate identified")).toBe("no-candidate");
	});

	it("returns candidate from flat text when content is domain/action", () => {
		expect(parseAssessmentCandidate("metrics/collect")).toBe("metrics/collect");
	});

	it("returns undefined for flat text without valid candidate", () => {
		expect(parseAssessmentCandidate("Maybe something useful.")).toBeUndefined();
	});
});
