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

<!--
AUDIT RULES:
- Candidate MUST be "No candidate identified" (→ only Scenario + Candidate required) OR "domain/action" (→ all 8 subsections required).
- DO NOT fill Confirmation before presenting the contract to the user.
- Keep ### subsections intact. Do not flatten Assessment into a plain list.
-->

### Scenario
<!-- What user need this command addresses. Example: "Get daily hot list from Zhihu." -->

### Candidate
<!-- MUST be exactly "No candidate identified" OR "domain/action" like "zhihu/get-hot". No natural language. -->

### Runtime
<!-- node | browser | shell | python -->

### Parameters
<!-- Expected inputs with types. Example: "date: string (YYYY-MM-DD, optional)" -->

### Output Schema
<!-- Expected result structure. Example: "Array<{title: string, url: string}>" -->

### Command Library Relation
<!-- reuse | conflict | new. Explain relationship to existing commands. -->

### Prerequisites
<!-- Setup or auth required. Example: "none" or "API key required" -->

### Confirmation
<!-- LEAVE EMPTY initially. AFTER presenting the contract to the user and getting explicit agreement, record the discussion summary here. -->
`;
}
