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
<!-- USER CONTRACT: What user need this command addresses. Present this to the user. Example: "Get daily hot list from Zhihu." -->

### Candidate
<!-- USER CONTRACT: Command name. MUST be exactly "No candidate identified" OR "domain/action" like "zhihu/get-hot". Present this to the user. -->

### Runtime
<!-- USER CONTRACT: Execution environment. Present to user. Options: node | browser | shell | python -->

### Parameters
<!-- USER CONTRACT: Expected inputs. Present to user so they know what parameters they will use. Example: "date: string (YYYY-MM-DD, optional)" -->

### Output Schema
<!-- USER CONTRACT: Result structure. Present to user so they know what output to expect. Example: "Array<{title: string, url: string}>" -->

### Command Library Relation
<!-- USER CONTRACT: Relationship to existing commands. Present to user. Options: reuse | conflict | new -->

### Prerequisites
<!-- USER CONTRACT: Setup or auth required. Present to user so they know what's needed before using this command. Example: "none" or "API key required" -->

### Confirmation
<!-- DO NOT FILL UNTIL USER REVIEWS ALL ABOVE CONTRACT ITEMS. After presenting the full Assessment contract to the user and getting explicit agreement on ALL items, record their confirmation here. -->
`;
}
