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

### Scenario
<!-- What user need this command addresses -->

### Candidate
<!-- Proposed command name (domain/action) or "No candidate identified" -->

### Runtime
<!-- node, browser, shell, or python -->

### Parameters
<!-- Expected inputs -->

### Output Schema
<!-- Expected structure of the result -->

### Command Library Relation
<!-- Relationship to existing commands (reuse, conflict, or new) -->

### Prerequisites
<!-- Setup or auth required -->

### Confirmation
<!-- Record of user discussion and agreement to proceed -->
`;
}
