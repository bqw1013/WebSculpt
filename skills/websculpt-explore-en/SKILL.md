---
name: websculpt-explore
description: Use for any scenario that requires acquiring or verifying external information, including when the user explicitly requests a lookup, or when you independently determine that you need to access the internet, websites, APIs, browser sessions, or the WebSculpt command library. Compared to direct searches or temporary scraping, this skill prioritizes leveraging information acquisition paths already accumulated by WebSculpt; it only explores new paths when necessary, reducing repeated trial-and-error and context consumption, and allowing successful experiences to accumulate into reusable capabilities for the future. Before invoking WebSearch, WebFetch, curl, browser automation tools, or the WebSculpt command library, you must use this skill first; whether responding to an explicit user request or spontaneously needing to acquire external information, you must follow this exploration protocol and must not skip explore by directly invoking tools.
---

# WebSculpt Explore

## Responsibilities

You are responsible for acquiring external information and delivering results to the user.

WebSculpt divides this process into two stages:
- **explore** (you): acquire information, validate paths, deliver results
- **capture** (`websculpt-capture`): solidify validated paths into reusable commands

The essence of a WebSculpt command is to convert a successfully validated path from exploration into a CLI command for quick reuse later. Commands are not limited to acquiring information; they can also perform operations. The criterion for precipitation is not "how many times the user will use it," but "whether this successful experience is worth reusing."

Your core task is to solve the user's current information acquisition needs. If a reusable path is discovered during exploration, record it in `trace.md`; if not, deliver the results directly without forcing a candidate.

`explore new` and `explore assess` are tools to help you structurally record the exploration process, not an extra burden.

## Workflow

### Step 1: Understand Requirements and Attempt Reuse

Clarify the information the user wants, time range, source preferences, and output format.

First, check if the command library has available commands:

```bash
websculpt command list
```

After discovering candidate commands, confirm applicability with progressively increasing detail:

```bash
# 1. Quickly view parameters and usage
websculpt <domain> <action> --help

# 2. View full contract card
websculpt command show <domain> <action>

# 3. Include README for deep confirmation (use as needed)
websculpt command show <domain> <action> --include-readme
```

**Notes when calling existing commands**:
- If invocation fails, first check if parameters were incorrect. After comparing with `--help` or `command show` output to correct parameters, you must try again. Try at least two different parameter combinations. Only if multiple attempts fail and it is confirmed not to be a parameter issue should you judge the command as unavailable.
- If the command indicates a browser environment is required (e.g., `BROWSER_ATTACH_REQUIRED`), stop immediately and inform the user to open `chrome://inspect/#remote-debugging` in Chrome, enable remote debugging, and keep the browser open before retrying. Also inform the user: browser automation carries the risk of being detected by target sites, which may lead to account restrictions or access limitations. Do not attempt to start a daemon or attach a browser yourself to bypass it. Only if the user explicitly says "don't use this command" or "I'll handle it" should you abandon it and enter external tool exploration. If the user explicitly refuses, subsequently skip browser-required commands directly in the same session; do not repeatedly ask.
- If a command library command requires browser execution, you do not need to read `guide.md` or operate the browser. It is executed by **WebSculpt daemon** (a background process independent of `@playwright/cli`).

**Decision**:
- Command covers the need → **must call this command to complete delivery, end**. Do not skip the command and explore on your own under the pretext of "verification", "attempt", or "supplementation". No `explore new` needed.
- Command cannot cover the need, or confirmed unavailable after the above systematic troubleshooting → proceed to Step 2.

### Step 2: Create Workspace and Record Library Check

When external tools (WebSearch, WebFetch, curl, or browser automation) are needed, create a workspace:

```bash
websculpt explore new <name> --intent "<goal description>"
```

**After creation, read the `trace.md` in the workspace first, confirm the initial structure and section positions, then start writing.**

The headings at all levels in `trace.md` are structural anchors for `explore assess`; do not delete, replace, rename, or adjust their levels. Please supplement content under the corresponding headings, and do not modify the headings themselves.

Write the library check conclusion into `trace.md`'s `Library Check` section.

### Step 3: Execute External Exploration

Select tools and begin exploration (see "Tool Selection"). Record key findings from each tool invocation to `trace.md` in real time, **and must include actual structured data samples obtained** (e.g., JSON fragments, extracted text content, selector match results). Do not just write "tried X" or "visited Y". If multiple attempts fail to extract data matching the target, record the failure reasons truthfully — this is equally critical for subsequent evaluation.

If using browser automation, you must first read `references/access/playwright-cli-guide.md` in the same directory as SKILL.md, and record the reading in `trace.md`'s `Protocol`. Do not execute `playwright-cli` before recording.

### Step 4: Evaluate and Record

Evaluate whether a precipitable path was produced. What is precipitated is a **successfully executed, parameterizable experience path**. If any of the following conditions are met, directly judge as no candidate:
- The path was not actually executed, or primary sources were not verified (not a successful experience)
- Output results are unstable, or the source is not reproducible (experience cannot be reused)
- The path lacks parameterizable characteristics; each execution requires completely different steps or inputs (cannot be converted into a CLI command)

After exclusion, if a reusable path is found, fill in the command contract in `## Assessment` of `trace.md` following the template comment guidance and audit rules, **but do not fill in `### Confirmation`**. Note: a reusable path must have a corresponding successful data record in `Tool Trace` as evidence; a contract fabricated without data samples is considered invalid.

If judged as no candidate, mark `"No candidate identified"` in Candidate.

### Step 5: Audit and Deliver

Deliver results to the user. Confirm `explore assess` has passed before delivery.

You can self-check at any time during exploration:

```bash
websculpt explore assess <name>
```

`assess` checks `trace.md` structural integrity (whether preset headings exist and have not been modified), safety rules, and Assessment subsection completeness. Assessment must use `###` subsection structure, and Candidate must be either `"No candidate identified"` or `domain/action` format. Supplement `trace.md` based on returned error hints (e.g., missing subsections, empty content, invalid Candidate format), then re-assess.

**Assessment must pass before exploration ends**. Do not deliver results without passing audit.

If Step 4 identified a candidate (not `"No candidate identified"`), handle delivery with the following flow:
1. Execute `websculpt explore assess <name>`, **expecting it to fail due to missing Confirmation**. Correct other issues based on returned errors (e.g., missing subsections, empty content, invalid Candidate format), but **still do not fill in Confirmation**.
2. After confirming other items are correct, you must present the full contract to the user first. Present the command name, functionality, parameters, output format, prerequisites, etc., in the user's language clearly, and explicitly request the user's agreement on the contract content.
3. After the user explicitly agrees, record the discussion summary and user decision in `### Confirmation`; if the user refuses, record the refusal reason in `### Confirmation`.
4. Re-execute `websculpt explore assess <name>` to ensure it fully passes.
5. Suggest entering `websculpt-capture`. If the user refuses, the explore phase ends.

Calling any tool or executing any `capture` subcommand is prohibited in the reply where the contract is presented. Do not create a capture workspace on your own.

## Tool Selection

### Prioritize Reusing Existing Commands

Commands in the WebSculpt library are verified information acquisition paths that usually provide high-quality structured output and significantly save tokens. Before invoking any external tool, you must prioritize attempting to reuse existing commands; do not abandon reuse due to a single parameter mistake.

### No Reusable Commands: Select External Tools

Browser automation is a core strength of WebSculpt, not a last-resort fallback. When structural obstacles such as JS rendering, login states, or anti-scraping measures are encountered, actively switch to browser automation instead of continuing to work around with lighter tools.

Select the external tool most conducive to leaving stable evidence. If task characteristics are unclear, start with light tools; once structural signals such as CAPTCHA, login walls, content requiring interaction, 403, or 429 appear, switch to browser automation.

| Scenario | Tool | Switch Signal |
|----------|------|---------------|
| Need to discover information sources or compare candidates | WebSearch | After finding an authoritative source, switch to WebFetch, curl, or browser to verify primary content. **Note**: Search results can only locate sources; **direct precipitation is strictly prohibited**. If only search snippets were verified without reading primary content via WebFetch/curl/browser, **directly judge as no candidate**. |
| URL known, need page body, document, or rendered content | WebFetch | Switch to curl or browser when body missing, JS rendering, login wall, 403/429 |
| URL known, need raw HTTP response, headers, raw HTML | curl | Switch to browser when HTML lacks key data or embedded scripts require interactive verification |
| Content depends on login state, JS rendering, multi-step interaction, or static scraping fails | Browser automation | Request user intervention for login/authorization; slow down and request confirmation for CAPTCHA |

**Prohibited search evasion**: If target information depends on login state, JS rendering, or structural signals like CAPTCHA/403/429 appear, continuing to search to evade browser automation is prohibited. Only two options: switch to browser automation, or explain to the user.

After using external tools, record tools and key findings into `trace.md`'s `Tool Trace`.

## Human-Agent Collaboration Boundary

Request user intervention:
- Payment or subscription required with no available session.
- Command library, light tools, and browser all exhausted but still cannot break through permissions, anti-bot measures, or structural changes.
- Multiple paths feasible but stability/rate limiting/account risk requires trade-offs.
- Operation may modify remote state or carries explicit account risk.

Handle by yourself: tool selection, single temporary failures, issues bypassable by switching sources.

When intervening, explain: what has been completed, what obstacle was encountered, and what solution is recommended.

## Prohibitions

- Prohibited from installing or using `playwright` (official library), `puppeteer`, `selenium`, or other browser automation tools. Unified under the project-designated `@playwright/cli`.
- Prohibited from executing any `playwright-cli` commands or browser operations before confirming `guide.md` has been read.
