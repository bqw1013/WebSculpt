# WebSculpt Exploration Strategy

> This document is for AI Agents, explaining how to choose tools and formulate exploration strategies when facing unfamiliar information acquisition scenarios, and how to prepare for precipitating stable, reusable command assets.

---

## 1. Tool Selection Strategy

### Step 1: Check the Command Library

The WebSculpt command library is a locally precipitated collection of information acquisition paths. Each command typically covers only one specific sub-task (such as getting a hot list from a certain site, extracting structured data from a specific page), not a complete workflow. Before calling WebSearch, WebFetch, curl, or browser automation, first check whether an available path already exists in the command library.

```bash
websculpt command list
```

Returns all available commands, including domain, action, description, and source (builtin / user). Browse the list for entries related to your current sub-task.

> If structured output is needed for parsing, append `--format json` before any command, e.g., `websculpt --format json command list`.

If candidate commands are found, confirm their applicability in the following shallow-to-deep order:

```bash
websculpt <domain> <action> --help
```

Quickly understand parameter list, default values, and basic usage.

```bash
websculpt command show <domain> <action>
```

View the full contract card, including parameter details, runtime prerequisites, and asset completeness.

```bash
websculpt command show <domain> <action> --include-readme
```

Append the original README.md for usage examples, return value descriptions, and error code definitions. Most comprehensive, but largest payload; use as needed.

If confirmed matching, directly invoke and execute; if the command library has no coverage, proceed to external tool selection.

The same check must be performed before precipitation; you must not propose precipitating a new command without confirming the command library has no overlap.

### Step 2: Select External Tools

When the command library has no coverage, proceed to external tool selection.

**First judge task characteristics**

Judge the complexity of the information acquisition path based on user intent, avoiding wasting time trying lightweight methods on tasks that obviously require a browser environment:

- If the task involves login state, multi-step interaction, JS-rendered content, or requires free navigation like a human, directly enable browser automation.
- If the target site is known to have strict anti-crawling against static fetching, also directly enable browser automation.
- If the task is simply finding public information or extracting static content from a known URL, start with lightweight methods.

Scenario reference:

| Scenario | Priority Tool |
|------|---------|
| Need to discover information sources, get search summaries | WebSearch |
| URL known, need targeted extraction of readable content from page | WebFetch / curl |
| URL known, need raw HTML source (meta, JSON-LD, etc.) | curl |
| Need login state, multi-step interaction, free navigation | Browser automation |
| Known strict anti-crawling, static methods already confirmed ineffective | Browser automation |

**Then confirm constraints**

Current browser automation only supports `playwright-cli`. Before using, you must first read `../access/playwright-cli/guide.md`, confirm connection method, available commands, and behavioral constraints before executing.

Other tools (WebSearch, WebFetch, curl, etc.) can be directly used according to your own capabilities, no need to consult the access layer.

**Principles during execution**

- **Start light when characteristics are unclear**: If the task does not fall into the "directly enable browser" situations above,prioritize trying WebSearch, WebFetch, or curl. But once receiving structural rejection signals (CAPTCHA, login wall, content only visible after interaction), immediately switch, do not entangle at the same level.
- **Cut losses**: After adjusting parameters for the same tool with no substantial improvement, switch to the next level; switching tools is not failure.
- **Primary source priority**: Search engines are only used to locate sources; after finding them, directly visit the original page to read the original text.

---

## 2. Human-AI Collaboration Decision Framework

During exploration, you do not need to solve all problems alone. Timely recognizing "this obstacle exceeds my current capability or authority" and requesting user intervention is an efficient strategic choice, not failure.

### When to Request User Intervention

The following situations tend toward stopping to ask the user:

- **Requires user credentials or authorization**: If the task involves login, payment, or subscription, and you do not have an active session or permission, ask the user before trying any tools, avoiding wasting attempts in an unauthorized state.
- **Requires user to choose between multiple paths**: When multiple feasible solutions exist (such as "use official API with rate limit but stable, use page scraping without limits but prone to failure"), and you lack the user's preference information.
- **All reasonable tool combinations have failed**: When you have already tried command library reuse, lightweight tools, and browser automation in complete combination, and still cannot break through the target site's anti-crawling or structural changes.

The following situations you should resolve yourself, without asking the user:

- **Tool selection or switching**: This is within your decision scope, no need for user approval.
- **Temporary failure of a single method**: Network fluctuations, slow page loading, etc., retry or adjust parameters.
- **Obstacles that can be bypassed by switching strategies**: Such as switching from static fetching to browser automation.

### Collaboration Method

When requesting the user, explain three things:

1. **Current progress**: What has already been done
2. **Encountered obstacle**: What problem prevents continuation
3. **Suggested solution**: Provide specific options for the user to choose, rather than throwing open-ended questions

After user response, continue exploration based on new information, without repeating previously invalid paths.

---

## 3. Connection Between Exploration and Precipitation

The endpoint of exploration is not "got it working", but "delivered answer + completed precipitation assessment". Precipitation assessment cannot be skipped.

During exploration, pay attention to collecting key information (tool sequence, URL, selectors, anti-crawling strategies, etc.), which will be used to fill `context.md`. Command authoring specifications for precipitated commands (manifest format, README.md / context.md section requirements, runtime contracts) are in `../compile/contract.md`.

The execution flow for precipitation (proposal card, draft, validate, create) is in SKILL.md.
