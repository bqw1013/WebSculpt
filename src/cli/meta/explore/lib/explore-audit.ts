/**
 * Three-layer Markdown audit for explore trace documents.
 *
 * L1: heading structure (exact match of required H2 headings)
 * L2: content presence under each heading (non-empty, non-comment, non-heading lines)
 * L3: safety-critical keyword gaps (guide.md acknowledgment for browser, verified URLs)
 * L4: Assessment H3 subsection structure and completeness
 */

const REQUIRED_H2 = ["Library Check", "Tool Trace", "Protocol", "Verified Sources", "Assessment"];
const CANDIDATE_H3 = [
	"Scenario",
	"Candidate",
	"Runtime",
	"Parameters",
	"Output Schema",
	"Command Library Relation",
	"Prerequisites",
	"Confirmation",
];
const NO_CANDIDATE_H3 = ["Scenario", "Candidate"];

export interface TraceAuditResult {
	passed: boolean;
	missingHeadings: string[];
	emptyHeadings: string[];
	keywordGaps: string[];
	missingSubHeadings: string[];
	emptySubHeadings: string[];
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
 * Checks whether the given Candidate subsection content declares no candidate.
 */
function isNoCandidate(content: string): boolean {
	return content.toLowerCase().includes("no candidate identified");
}

/**
 * Checks whether the given Candidate subsection content matches a valid domain/action pattern.
 */
function isValidCandidate(content: string): boolean {
	return /^[a-z0-9-]+\/[a-z0-9-]+$/.test(content.trim());
}

/**
 * Parses H3 subsections from the Assessment section lines.
 */
function parseH3Sections(assessmentLines: string[]): Map<string, string[]> {
	const sections = new Map<string, string[]>();
	let currentH3: string | null = null;

	for (const line of assessmentLines) {
		const h3Match = line.match(/^###\s+(.+)$/);
		if (h3Match) {
			const heading = h3Match[1];
			if (heading === undefined) continue;
			currentH3 = heading.trim();
			if (!sections.has(currentH3)) {
				sections.set(currentH3, []);
			}
		} else if (currentH3 !== null) {
			sections.get(currentH3)?.push(line);
		}
	}

	return sections;
}

/**
 * Checks whether a section has non-empty, non-comment, non-heading content.
 */
function hasRealContent(lines: string[]): boolean {
	return lines.some((line) => {
		const trimmed = line.trim();
		return trimmed !== "" && !trimmed.startsWith("#") && !trimmed.startsWith("<!--");
	});
}

/**
 * Extracts the candidate value from the `### Candidate` H3 subsection.
 * Returns the candidate name, "no-candidate", or undefined if unclear.
 */
export function parseAssessmentCandidate(sectionContent: string): string | undefined {
	const lines = sectionContent.split("\n");
	let inCandidate = false;
	const candidateLines: string[] = [];

	for (const line of lines) {
		if (/^###\s+Candidate\s*$/i.test(line)) {
			inCandidate = true;
			continue;
		}
		if (inCandidate && /^###\s/.test(line)) {
			break;
		}
		if (inCandidate) {
			candidateLines.push(line);
		}
	}

	// Fallback for flat-text Assessment (no H3 headings)
	const candidateContent = candidateLines.length > 0 ? candidateLines.join("\n").trim() : sectionContent.trim();

	const lower = candidateContent.toLowerCase();
	if (lower.includes("no candidate identified")) {
		return "no-candidate";
	}
	if (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(candidateContent)) {
		return candidateContent;
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
		const hasNonStructuralContent = sectionLines.some((line) => line.trim() !== "" && !line.trim().startsWith("#"));
		const hasH3Subsections = sectionLines.some((line) => /^###\s/.test(line.trim()));
		if (!hasNonStructuralContent && !hasH3Subsections) {
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

	// L4: Assessment H3 subsection audit
	const missingSubHeadings: string[] = [];
	const emptySubHeadings: string[] = [];

	const assessmentLines = h2Sections.get("Assessment") ?? [];
	const h3Sections = parseH3Sections(assessmentLines);

	const candidateLines = h3Sections.get("Candidate");
	const candidateContent = candidateLines?.join("\n").trim() ?? "";

	let candidateType: "no-candidate" | "candidate" | "ambiguous" = "ambiguous";
	if (isNoCandidate(candidateContent)) {
		candidateType = "no-candidate";
	} else if (isValidCandidate(candidateContent)) {
		candidateType = "candidate";
	}

	const requiredH3 = candidateType === "no-candidate" ? NO_CANDIDATE_H3 : CANDIDATE_H3;

	if (candidateType === "ambiguous") {
		hardErrorCode = "INVALID_CANDIDATE_FORMAT";
	} else {
		for (const h3 of requiredH3) {
			if (!h3Sections.has(h3)) {
				missingSubHeadings.push(h3);
			} else {
				const sectionLines = h3Sections.get(h3) ?? [];
				if (!hasRealContent(sectionLines)) {
					emptySubHeadings.push(h3);
				}
			}
		}
	}

	if (missingSubHeadings.length > 0 || emptySubHeadings.length > 0) {
		if (!hardErrorCode) {
			hardErrorCode = "ASSESSMENT_INCOMPLETE";
		}
	}

	// Confirmation hard gate for candidate paths
	if (candidateType === "candidate") {
		if (!h3Sections.has("Confirmation") || !hasRealContent(h3Sections.get("Confirmation") ?? [])) {
			hardErrorCode = "CONFIRMATION_MISSING";
			if (!h3Sections.has("Confirmation")) {
				if (!missingSubHeadings.includes("Confirmation")) {
					missingSubHeadings.push("Confirmation");
				}
			} else {
				if (!emptySubHeadings.includes("Confirmation")) {
					emptySubHeadings.push("Confirmation");
				}
			}
		}
	}

	const structuralOk = missingHeadings.length === 0 && emptyHeadings.length === 0;
	const assessmentOk =
		missingSubHeadings.length === 0 && emptySubHeadings.length === 0 && candidateType !== "ambiguous";
	const passed = structuralOk && keywordGaps.length === 0 && assessmentOk;

	return {
		passed,
		missingHeadings,
		emptyHeadings,
		keywordGaps,
		missingSubHeadings,
		emptySubHeadings,
		code: hardErrorCode,
	};
}
