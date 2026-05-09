---
name: websculpt-explore
description: Use for any scenario that requires acquiring or verifying external information, including when the user explicitly requests a lookup, or when you independently determine that you need to access the internet, websites, APIs, browser sessions, or the WebSculpt command library. Compared to direct searches or temporary scraping, this skill prioritizes leveraging information acquisition paths already accumulated by WebSculpt; it only explores new paths when necessary, reducing repeated trial-and-error and context consumption, and allowing successful experiences to accumulate into reusable capabilities for the future. Before invoking WebSearch, WebFetch, curl, browser automation tools, or the WebSculpt command library, you must use this skill first; whether responding to an explicit user request or spontaneously needing to acquire external information, you must follow this exploration protocol and must not skip explore by directly invoking tools.
---

# WebSculpt Explore

## WebSculpt Overview

WebSculpt accumulates information acquisition paths as locally reusable `domain/action` commands. "Capture" is the term for this accumulation process; the CLI command `capture` is its entry point. The closed loop consists of three stages:

1. **explore** — Complete the information acquisition task and discover reusable paths.
2. **capture** — Organize path evidence to prepare for subsequent command generation.
3. **compile** — Compile verified paths into command packages and install them into the command library.

`websculpt-explore` is the first stage.

## Responsibilities

You are the discovery and validation layer. When facing an information acquisition task, you are responsible for:

1. Understanding the information to be acquired, constraints, and output format.
2. Checking and reusing the WebSculpt command library first; when no commands are available, choosing among WebSearch, WebFetch, curl, or browser automation.
3. Advancing exploration with small-step validation, promptly switching away from invalid paths, and preserving failure signals.
4. Delivering results while recording verified path evidence.
5. After delivery, outputting a Capture Assessment to hand off candidate paths to `websculpt-capture`; do not create capture workspaces or generate command assets in this stage.

## Startup Protocol

Every time you enter the explore phase, execute the following protocol first:

1. Clarify the information the user wants to acquire, time range, source preferences, and output format.
2. Execute "Check Library and Select Tools": check the library to reuse existing commands first; only select external tools when none are reusable.
3. If it is determined that browser automation is needed, read `./references/access/playwright-cli-guide.md` before execution.
4. Advance exploration with small-step validation; do not make subsequent judgments based on unverified guesses, and promptly switch away from invalid paths.
5. When delivering results, execute Capture assessment in the same reply and append a Capture Assessment.

## ExploreSession (Mandatory)

At the **end** of every reply, you must output the current ExploreSession status block. The format is as follows:

```yaml
ExploreSession:
  libraryChecked: false
  libraryResult: null
  guideRead: null
  toolsUsed: []
  captureAssessment:
    candidate: null
    reason: null
```

### Status Rules

- When `libraryChecked` is `false`, you **must** execute `websculpt command list` first, write the result into `libraryResult`, then set `libraryChecked` to `true`, before proceeding to the next step.
- `libraryResult` must honestly record the conclusion of the library check and attempted invocation. If an existing command was reused, write `"Reused <domain>/<action>"`; if no match was found, write `"No match"`; if the command partially covers but does not satisfy the requirement, write `"<domain>/<action> partial coverage: <reason>, requires supplementary exploration"`.
- If `libraryResult` starts with "requires supplementary exploration" or "No match", **you are forbidden from delivering results directly**; you must continue exploring with external tools.
- `guideRead` is only required when you **personally operate the browser** (e.g., via Playwright CDP attach) to perform web exploration. Invoking existing commands in the command library with `runtime: browser` is executed in the background and is unrelated to you; you do not need to read guide.md, and `guideRead` remains `null`.
- `toolsUsed` records all tools used in this exploration, such as `["command-reuse", "browser"]`. Reusing existing commands from the command library also counts as tool usage.
- Before exploration ends, neither field in `captureAssessment` may be `null`.

## Check Library and Select Tools

### Prioritize Reusing Existing Commands

Commands accumulated in the WebSculpt command library are already-verified information acquisition paths that usually provide high-quality structured output and significantly save tokens. Before invoking any external information acquisition tools, **you must prioritize attempting to reuse existing commands**; do not abandon reuse and switch to self-exploration just because of a single parameter mistake or unfamiliar format.

First, list currently available commands:

```bash
websculpt command list
```

After discovering candidate commands, confirm applicability with progressively increasing levels of detail. Do not read the heaviest documentation first; start light and go deeper as needed:

```bash
# 1. Quickly view parameters and usage (lightest)
websculpt <domain> <action> --help

# 2. View the full contract card: parameters, runtime, preconditions
websculpt command show <domain> <action>

# 3. Include original README for deep confirmation (heaviest, use as needed)
websculpt command show <domain> <action> --include-readme
```

Through the above progressive confirmation, judge whether the command covers the current task. If it only covers a sub-task, reuse that sub-task and continue exploring the remainder. Call it directly after confirming coverage.

#### Notes When Calling Existing Commands

- **If the invocation fails, first check whether parameters were passed incorrectly**. After comparing with the `--help` or `command show` output to correct parameters, **you must try again**; do not give up directly. Try at least two different parameter combinations; only if multiple attempts fail and it is confirmed not to be a parameter issue should you judge the command as unavailable.
- **If the command return indicates a browser environment is required** (e.g., prompts `BROWSER_ATTACH_REQUIRED` or similar), **stop immediately** and inform the user that a browser and debug mode need to be enabled. Do not attempt to start a daemon or attach a browser yourself to bypass it. Only if the user explicitly says "don't use this command" or "I'll handle it myself" should you abandon the command and enter external tool exploration. If the user explicitly refuses, subsequently in the same session when encountering command library commands that require a browser, skip them directly and do not ask repeatedly.
- **If an existing command in the command library requires browser execution, you do not need to read `guide.md`**. That command is executed by the WebSculpt backend and is unrelated to your direct browser operation; `guideRead` status is unaffected.

After completing the library check and attempted invocation, update ExploreSession:
- `libraryChecked: true`
- `libraryResult: "<your conclusion>"`
- `toolsUsed` append `"command-reuse"`

### No Reusable Commands: Select External Tools

Select the external tool that can complete the current task and is most conducive to leaving stable evidence for subsequent steps. If the task characteristics are unclear, start with light tools; once structural signals such as CAPTCHA, login walls, content that requires interaction to become visible, 403, or 429 appear, switch to browser automation.

| Scenario | Tool | Switch Signal |
|----------|------|---------------|
| Need to discover information sources or compare multiple candidate sources | WebSearch | After finding an authoritative source, switch to WebFetch, curl, or browser to verify primary content. **Note**: Search results can only be used to locate sources; **direct precipitation is strictly prohibited**. If this exploration only verified search snippets without reading primary content via WebFetch/curl/browser, **directly judge as no candidate** and do not give domain/action suggestions. |
| URL known, need to read page body, document, or already-rendered content | WebFetch | Switch to curl or browser when body is missing, JS rendering, login wall, 403/429. |
| URL known, need raw HTTP response, headers, raw HTML, or embedded script data | curl | Switch to browser when HTML lacks key data or embedded scripts require interactive verification. |
| Content depends on login state, JS rendering, multi-step interaction, or static scraping fails / strong anti-bot | Browser automation | Request user intervention when login, authorization, or handling high-risk account operations are needed; slow down and request confirmation when CAPTCHA, abnormal verification, or account risk appears. |

After using external tools, update ExploreSession:
- `toolsUsed` append the name of the used tool (e.g., `"websearch"`, `"webfetch"`, `"curl"`, `"browser"`)

## Exploration Closed Loop

Executing exploration is not "find the answer and finish"; it is a continuous cycle of "find answer → deliver → evaluate".

During exploration, you are always in a cycle of the following four states:

- **Iterative Approximation**: Select tool → Execute → Observe result → Decide whether to continue, adjust strategy, or switch tools.
- **Reuse on Demand**: If a command in the command library can cover a sub-task, call it directly rather than reimplementing it.
- **Terminal Awareness**: Continuously assess whether the goal is achieved, whether the current path is effective, and whether to switch strategy or request user intervention.
- **Path Tracking**: In real time, record key URLs, selectors, APIs, and tool sequences to preserve evidence for subsequent evaluation. During exploration, retain the following clues for `websculpt-capture` to pick up later:

  - Visited URLs, APIs, page entry points.
  - Valid parameters and sample output.
  - Reusable DOM selectors, JSON fields, or response structures.
  - Failed paths, failure reasons, and switch strategies.
  - Login state, anti-bot, rate limiting, and environmental dependencies.

  Only record information that has been actually verified; do not record paths that are theoretically feasible but were not successfully executed this time. When you can obtain APIs, JSON-LD, or stable fields, prioritize recording stable interfaces over fragile DOM.

Path switching is not failure; it is a normal part of exploration. When switching, preserve failure signals, because these signals are valuable for subsequent capture and repair.

## Human-Agent Collaboration Boundary

Request user intervention when:

- Payment or subscription is required, and no available session currently exists.
- The command library, light tools, and browser have all been exhausted but still cannot break through permissions, anti-bot, or structural changes.
- Multiple paths are feasible, but stability, rate limiting, or account risk require user preference trade-offs.
- The operation may modify remote state or carries explicit account risk.

Handle by yourself: tool selection, single temporary failures, issues that can be bypassed by switching sources.

When intervening, you must explain: what has been completed, what obstacle was encountered, and what solution is recommended.

## Browser Exploration

> **Note**: The "browser automation" described in this section refers to you **directly operating** the browser for web exploration. Invoking existing commands in the command library that require browser execution is not within the scope of this section; handle them according to the instructions in "Check Library and Select Tools".

Browser automation is suitable for login state, JS rendering, multi-step interaction, or scenarios where static scraping is difficult. Before execution, you must read `./references/access/playwright-cli-guide.md`.

Before using browser automation, confirm ExploreSession:
- If `guideRead` is not `true`, read `./references/access/playwright-cli-guide.md` first
- After reading, set `guideRead: true`
- `toolsUsed` append `"browser"`

## Capture Evaluation

When delivering exploration results, you must complete Capture evaluation in the same reply and append a Capture Assessment; silent skipping is prohibited.

### When Evaluation Is Mandatory

Evaluation is mandatory whenever any of the following conditions are met:

- Used `WebSearch`, `WebFetch`, `curl`, or browser automation to acquire information.
- Visited a specific website or API and successfully extracted structured data.
- Discovered a parameterized reusable information acquisition path.

### Why Capture

`websculpt-capture` is the process of organizing and precipitating the information acquisition path verified during this exploration into a locally reusable command. After precipitation, the command is installed into the WebSculpt command library; the next time a similar need arises:

- **No need to re-search, scrape, or debug**; directly invoke the command to obtain structured results
- **Save token and repeated exploration time costs**
- **More stable output quality**, unaffected by search result fluctuations or temporary page structure changes

The explore stage is only responsible for discovering candidate paths; the capture stage is responsible for "solidifying" paths into commands. The division of labor is clear; do not overstep your role in the explore stage.

### Evaluation Checklist

Explore only makes lightweight judgments and does not replace capture's comprehensive assessment. **The default conclusion is "no candidate"**.

When performing evaluation, **you must first complete Step 1 negative checks**. If any exclusion item is met, directly judge as "no candidate", **and you are forbidden from continuing to answer the core questions in Step 2**.

**Step 1: Mandatory Exclusion Checks (if any are met, terminate immediately with conclusion "no candidate")**

- This was just a one-time Q&A with no parameterizable path.
- Only search snippets were verified, and primary sources were not read.
- The path was not actually executed; it was only theoretically feasible.
- Output results are unstable; the same input may yield different structures at different times.

**Step 2: Core Questions (only answer when Step 1 has not been triggered)**

1. Did this exploration discover a seemingly reusable information acquisition path?
2. If so, what is the candidate `domain/action`?

If the path was actually executed and looks reusable, you may give a candidate suggestion. Specific value assessment, deduplication, and granularity judgment are the responsibility of `websculpt-capture`.

### Capture Assessment Format

Before outputting the Assessment, **you must self-check**: if this exploration mainly relied on WebSearch and did not read primary sources, the `candidate` field must be "None", and you must not fabricate a domain/action.

After completing the evaluation, append the following to the final reply:

```text
Capture Assessment:
- Reused existing command: Yes / No
- Command to precipitate: <domain>/<action> or None
- Evaluation reason: Brief explanation
- Suggested next step: None / websculpt-capture
```

Field descriptions:

- **Reused existing command**: Whether an existing command in the command library was directly invoked to complete information acquisition this time.
- **Command to precipitate**: If a new reusable path was discovered this time, provide the suggested `domain/action`; if an existing command was reused or there is no precipitable path, fill in "None".
- **Evaluation reason**: One sentence explaining why capture is recommended or not recommended.
- **Suggested next step**: Choose according to scenario
  - Reused existing command → "None" (command library already covers it, no extra action needed)
  - Discovered new path → "websculpt-capture (precipitate the verified path into a locally reusable command)"
  - No match and no new path → "None"

After the Agent outputs the Capture Assessment, **it must briefly explain the precipitation suggestion to the user and request confirmation** before recommending entry into `websculpt-capture`. Do not create a capture workspace without user consent.

### Status Update

After completing the Capture Assessment, you must synchronize the update to ExploreSession:
- `captureAssessment.candidate`: "<domain>/<action>" or `null`
- `captureAssessment.reason`: One-sentence reason

Then output the complete ExploreSession status block, and end this exploration.

If `Command to precipitate` is not "None", explain the value of capture to the user (precipitating the verified path into a locally reusable command, so that subsequent similar needs can be directly invoked, saving tokens), then recommend entering `websculpt-capture`; do not create captures or command packages within this skill.
