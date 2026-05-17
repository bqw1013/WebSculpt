/**
 * Three-layer Markdown audit for explore trace documents.
 *
 * L1: heading structure (exact match of required H2 headings)
 * L2: content presence under each heading (non-empty, non-comment, non-heading lines)
 * L3: safety-critical keyword gaps (guide.md acknowledgment for browser, verified URLs)
 */

const REQUIRED_H2 = ["Library Check", "Tool Trace", "Protocol", "Verified Sources", "Assessment"];

export interface TraceAuditResult {
	passed: boolean;
	missingHeadings: string[];
	emptyHeadings: string[];
	keywordGaps: string[];
	code?: string;
}

/**
 * Infers whether the trace describes a browser-automated path.
 * Heuristic: content mentions "browser" or "playwright" (case-insensitive).
 */
function inferBrowserRuntime(content: string): boolean {
	return /\bbrowser\b/i.test(content) || /\bplaywright\b/i.test(content);
}

/**
 * Checks whether the Assessment section declares a candidate command.
 * Returns the candidate name, "no-candidate", or undefined if unclear.
 */
export function parseAssessmentCandidate(sectionContent: string): string | undefined {
	const lower = sectionContent.toLowerCase();
	if (lower.includes("no candidate identified")) {
		return "no-candidate";
	}
	// Look for "Candidate: domain/action" or similar patterns
	const candidateMatch = sectionContent.match(/candidate[:\s]+([a-z0-9-]+\/[a-z0-9-]+)/i);
	if (candidateMatch?.[1]) {
		return candidateMatch[1];
	}
	return undefined;
}

/**
 * Audits a trace.md document against the three-layer explore trace rules.
 *
 * @param content - Raw Markdown content of trace.md
 * @returns Audit result with pass/fail and detailed gap lists
 */
export function auditTrace(content: string): TraceAuditResult {
	// Strip all HTML comments (including multiline) before analysing content.
	const contentWithoutComments = content.replace(/<!--[\s\S]*?-->/g, "");

	const lines = contentWithoutComments.split("\n");
	const h2Sections = new Map<string, string[]>();
	let currentH2: string | null = null;

	for (const line of lines) {
		const h2Match = line.match(/^##\s+(.+)$/);
		if (h2Match) {
			const heading = h2Match[1];
			if (heading === undefined) continue;
			currentH2 = heading.trim();
			if (!h2Sections.has(currentH2)) {
				h2Sections.set(currentH2, []);
			}
		} else if (currentH2 !== null) {
			h2Sections.get(currentH2)?.push(line);
		}
	}

	const missingHeadings = REQUIRED_H2.filter((h) => !h2Sections.has(h));
	const emptyHeadings: string[] = [];

	for (const [heading, sectionLines] of h2Sections) {
		const hasContent = sectionLines.some((line) => line.trim() !== "" && !line.trim().startsWith("#"));
		if (!hasContent) {
			emptyHeadings.push(heading);
		}
	}

	const keywordGaps: string[] = [];
	let hardErrorCode: string | undefined;

	// L3: browser runtime should reference guide.md
	if (inferBrowserRuntime(contentWithoutComments) && !contentWithoutComments.includes("guide.md")) {
		keywordGaps.push("guide-read");
		hardErrorCode = "GUIDE_NOT_ACKNOWLEDGED";
	}

	// L3: at least one verified URL should be present
	if (!/https?:\/\//.test(contentWithoutComments)) {
		keywordGaps.push("verified-urls");
		hardErrorCode = "NO_VERIFIED_URL";
	}

	const structuralOk = missingHeadings.length === 0 && emptyHeadings.length === 0;
	const passed = structuralOk && keywordGaps.length === 0;

	return {
		passed,
		missingHeadings,
		emptyHeadings,
		keywordGaps,
		code: hardErrorCode,
	};
}
