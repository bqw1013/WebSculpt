import { describe, expect, it } from "vitest";
import { auditEvidence } from "../../../../../../src/cli/meta/capture/lib/evidence-audit.js";

describe("auditEvidence", () => {
	it("passes for a fully valid evidence document", () => {
		const content = `## Exploration Path
Consulted guide.md for browser automation approach.

## Verified URLs
https://example.com/page

## Structural Evidence
Selector #data returns JSON array.

## Failure Signals
Login wall triggers redirect to /login.

## Capture Assessment
Ready to capture.`;

		const result = auditEvidence(content, "browser");

		expect(result.passed).toBe(true);
		expect(result.missingHeadings).toEqual([]);
		expect(result.emptyHeadings).toEqual([]);
		expect(result.keywordGaps).toEqual([]);
	});

	it("fails when required headings are missing or empty", () => {
		const content = `## Exploration Path
Valid path description.

## Verified URLs
https://example.com/page

## Structural Evidence
Some data.

## Capture Assessment
`;

		const result = auditEvidence(content, "node");

		expect(result.passed).toBe(false);
		expect(result.missingHeadings).toEqual(["Failure Signals"]);
		expect(result.emptyHeadings).toEqual(["Capture Assessment"]);
	});

	it("reports keyword gaps for browser runtime without guide.md reference and without verified URLs", () => {
		const content = `## Exploration Path
Used browser devtools.

## Verified URLs
example.com/page

## Structural Evidence
Selector works.

## Failure Signals
None.

## Capture Assessment
Ready.`;

		const result = auditEvidence(content, "browser");

		expect(result.passed).toBe(true);
		expect(result.keywordGaps).toEqual(["guide-read", "verified-urls"]);
	});
});
