/** Generates a trace.md template with the 5 mandatory H2 headings and HTML comment guidance. */
export function generateTraceTemplate(): string {
	return `## Library Check

<!-- List the commands you checked in the command library (e.g., websculpt command list). Note any relevant existing commands. -->

## Tool Trace

<!-- Document the tools, APIs, or libraries you explored. Include key findings, limitations, and version notes. -->

## Protocol

<!-- Describe the protocol or workflow required. For browser automation, explicitly reference guide.md. -->

## Verified Sources

<!-- List verified URLs (https://) you examined. At least one URL is required. -->

## Assessment

<!-- Provide a preliminary command contract:
- Scenario: what user need this addresses
- Candidate: proposed command name (domain/action) or "No candidate identified"
- Runtime: node, browser, shell, or python
- Parameters: expected inputs
- Output schema: expected structure of the result
- Prerequisites: setup or auth required
- Rationale: why this command is needed
- Reuse conclusion: whether an existing command can be reused
-->
`;
}
