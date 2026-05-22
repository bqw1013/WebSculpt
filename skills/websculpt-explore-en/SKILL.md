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
- If the command indicates a browser environment is required (e.g., `BROWSER_ATTACH_REQUIRED`), stop immediately and inform the user. Do not attempt to start a daemon or attach a browser yourself. Only if the user explicitly says "don't use this command" or "I'll handle it" should you abandon it. If the user explicitly refuses, subsequently skip browser-required commands directly.
- If a command library command requires browser execution, you do not need to read `guide.md`. It is executed by the WebSculpt backend.

**Decision**:
- Command directly covers the need → call it, deliver results, end. No `explore new` needed.
- Needs supplementation or replacement → proceed to Step 2.

### Step 2: Create Workspace and Record Library Check

When external tools (WebSearch, WebFetch, curl, or browser automation) are needed, create a workspace:

```bash
websculpt explore new <name> --intent "<goal description>"
```

`explore new` returns the workspace path. Write the library check conclusion into `trace.md`'s `Library Check` section.

### Step 3: Execute External Exploration

Select tools and begin exploration (see "Tool Selection"). Record key findings to `trace.md` in real time.

If using browser automation, you must first read `references/access/playwright-cli-guide.md` in the same directory as SKILL.md, and record the reading in `trace.md`'s `Protocol`. Do not execute `playwright-cli` before recording.

### Step 4: Self-Check and Audit

You can self-check at any time during exploration:

```bash
websculpt explore assess <name>
```

`assess` checks `trace.md` structural integrity, safety rules, and Assessment subsection completeness. Supplement `trace.md` based on returned error hints (e.g., missing subsections, empty content), then re-assess.

**Assessment must pass before exploration ends**. Do not deliver results without passing audit.

### Step 5: Deliver and Hand Off

Deliver results to the user. Confirm `explore assess` has passed before delivery.

Evaluate whether a precipitable path was produced. If any of the following conditions are met, directly judge as no candidate:
- This was a one-time Q&A with no parameterizable path.
- Only search snippets were verified without reading primary sources.
- The path was not actually executed.
- Output results are unstable.

After exclusion, if a reusable path is found:
1. Fill in the command contract in `## Assessment` of `trace.md`, then execute `websculpt explore assess <name>`
2. Supplement according to assess error hints (e.g., missing subsections, empty content, missing Confirmation), repeat until passed
3. After assess passes, translate the contract into the user's language and present it to the user to obtain explicit agreement
4. Record the discussion summary and user decision in `### Confirmation`, re-assess to ensure it passes
5. After user approval, suggest entering `websculpt-capture`

Calling any tool or executing any `capture` subcommand is prohibited in the reply where the contract is presented. Do not create a capture workspace on your own. If the user refuses to solidify, record the refusal reason in `### Confirmation`, and the explore phase ends.

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
- Command library, light tools, and browser all exhausted but still cannot break through.
- Multiple paths feasible but stability/rate limiting/account risk requires trade-offs.
- Operation may modify remote state or carries explicit account risk.

Handle by yourself: tool selection, single temporary failures, issues bypassable by switching sources.

When intervening, explain: what has been completed, what obstacle was encountered, and what solution is recommended.

## Prohibitions

- Prohibited from installing or using `playwright` (official library), `puppeteer`, `selenium`, or other browser automation tools. Unified under the project-designated `@playwright/cli`.
- Prohibited from executing any `playwright-cli` commands or browser operations before confirming `guide.md` has been read.
