/**
 * Three-layer Markdown audit for capture evidence documents.
 *
 * L1: heading structure (exact match of required H2 headings)
 * L2: content presence under each heading (non-empty, non-comment, non-heading lines)
 * L3: keyword gap warnings (guide-read, verified-urls)
 */

const REQUIRED_H2 = [
	"Exploration Path",
	"Verified URLs",
	"Structural Evidence",
	"Failure Signals",
	"Capture Assessment",
];

export interface EvidenceAuditResult {
	passed: boolean;
	missingHeadings: string[];
	emptyHeadings: string[];
	keywordGaps: string[];
}

/**
 * Audits an evidence.md document against the three-layer capture evidence rules.
 *
 * @param content - Raw Markdown content of evidence.md
 * @param runtime - Command runtime (affects L3 keyword gap checks)
 * @returns Audit result with pass/fail and detailed gap lists
 */
export function auditEvidence(content: string, runtime: string): EvidenceAuditResult {
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

	// L3: browser runtime should reference guide.md
	if (runtime === "browser" && !contentWithoutComments.includes("guide.md")) {
		keywordGaps.push("guide-read");
	}

	// L3: at least one verified URL should be present
	if (!/https?:\/\//.test(contentWithoutComments)) {
		keywordGaps.push("verified-urls");
	}

	const passed = missingHeadings.length === 0 && emptyHeadings.length === 0;

	return {
		passed,
		missingHeadings,
		emptyHeadings,
		keywordGaps,
	};
}
