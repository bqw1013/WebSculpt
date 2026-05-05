---
name: websculpt
description: Internet information acquisition strategy framework. Before calling WebSearch, WebFetch, curl, or browser automation tools, you must read this framework documentation. Whether you are responding to an explicit user request or spontaneously need to acquire information from the internet, you should first follow the startup protocol in this document rather than directly invoking tools. This framework automatically coordinates multiple tools to complete collection via the optimal path, supports reusing user browser sessions to handle login states and complex interactions, and can precipitate successful paths into reusable assets, saving tokens and accelerating subsequent responses.
---

# WebSculpt

> After loading this skill, you **must immediately read in full** [references/explore/strategy.md](references/explore/strategy.md). This document contains the tool selection matrix, human-AI collaboration boundaries, and the iterative framework. It is the decision basis for all your information acquisition tasks. Do not call any information acquisition tools before completing the reading.

## What This Is

WebSculpt is an information acquisition framework providing strategy documents, tool capabilities, and a reusable local command library.

## Your Role

You are the decision maker for information gathering tasks. When facing a goal that requires acquiring information from the internet, you gradually approach the answer by iteratively selecting tools, executing operations, and observing results.

You are not executing a predetermined script — you have strategy documents and operation guides as references, but the choice of which tool to use at each step and how to combine them is judged by you based on the current state.

## The Complete Exploration Loop

Executing exploration does not end when "the answer is found", but is a complete loop of "find answer → deliver → precipitation assessment". The fourth step "completion judgment" requires you to execute precipitation assessment after delivering the answer; silent skipping is prohibited.

- **Iterative approach**: Select tool → Execute → Observe result → Decide whether to continue, adjust strategy, or switch tools
- **Reuse on demand**: During exploration, if a command in the command library can cover a sub-task, directly invoke it rather than re-implementing
- **End-state awareness**: Continuously evaluate whether the goal is achieved, whether the current path is effective, and whether strategy switching or user intervention is needed
- **Path tracking**: Real-time record key URLs, selectors, APIs, and tool sequences, accumulating material for precipitation assessment

## Installation

If the environment is not ready:

```bash
npm install -g @playwright/cli websculpt
```

When uncertain about any command's parameters, use `websculpt <command> --help` to get real-time help.

## Precipitation

> The following sections are arranged in recommended execution order, forming the complete loop of "explore → deliver → precipitation assessment".

### 1. Trigger Conditions (Non-bypassable)

As long as you meet any of the following conditions, after delivering the answer to the user, you must proactively propose a precipitation assessment, and must not wait for the user to request it:

| Trigger Condition | Prohibited Behavior |
|---|---|
| Used `WebSearch`, `WebFetch`, `curl`, or browser automation tools to acquire information | Skipping precipitation on the grounds of "this was just a simple search" |
| Visited a specific website or API and successfully extracted structured data | Skipping precipitation on the grounds of "the user didn't ask for precipitation" |
| Discovered an information acquisition path that is "reusable with parameter changes" | Entering the next round of conversation directly after delivering the answer without assessing the current path |

**Silent skipping of precipitation is prohibited**. Even if the user did not actively request it, as long as the current exploration produced a reusable sub-task, you must proactively propose a precipitation plan. Before receiving explicit user rejection, do not assume "the user doesn't need it".

### 2. Precipitation Assessment

Once precipitation is confirmed to be needed, immediately execute the following assessment without delay or skipping.

- Precipitated commands must be directly based on logic verified during the current exploration process, and are a summary of exploration experience
- **Prohibit designing commands not actually verified during exploration out of thin air**. Even if theoretically feasible, if it was not actually run through in the current exploration, it must not be precipitated
- Prioritize precipitating small-grained, parameterizable sub-tasks rather than complete large scripts including login, search, and cleaning
- **Enumerate all precipitable sub-tasks**. Check each independent site/API visited during the current exploration one by one, do not only focus on the main path. If both HN and Reddit were visited, these are two independent sub-tasks.
- **Deduplicate**. For each sub-task, execute `websculpt command list` to check the command library. If domain/action or core functionality already exists, do not precipitate redundantly; if existing commands can cover it, mark as "already covered" and terminate.
- **Judge reuse value and determine domain/action**. For sub-tasks that pass deduplication, assess their reuse value and determine naming:
  - `domain`: Target service or site (e.g., `github`, `reddit`)
  - `action`: Operation behavior (e.g., `list`, `search-posts`)

### 3. Precipitation Proposal

Present the precipitation assessment results to the user in a concise form, requesting a decision. Follow these principles:

- If multiple precipitable sub-tasks exist, list them one by one, do not only mention one
- For each sub-task, explain domain/action, data source, and stability judgment
- Clearly inform the user of deduplication results (whether overlapping commands already exist in the command library)
- Provide clear options: precipitate all / precipitate partial / do not precipitate for now

If the user explicitly rejects, record and terminate; if the user selects partial or all, then submit complete proposal cards for the selected items respectively.

### 4. Precipitation Proposal Card

When reporting the precipitation plan to the user, you must submit a structured precipitation proposal card, and **obtain explicit user confirmation** before starting execution of precipitation. **Without user confirmation**, do not execute any precipitation operations.

The proposal card must contain the following fields:

| Field | Required | Description |
|------|------|------|
| `domain` / `action` | Yes | Command name suggestion |
| `description` | Yes | One-sentence description of command purpose |
| `ioExamples` | Yes | At least one set of input parameter examples and expected output |
| `valueAssessment` | Yes | Why it's worth precipitating (generality, reuse frequency, time saved) |
| `stabilityAssessment` | Yes | Structural stability assessment of target site/interface |
| `antiCrawlAssessment` | Yes | Anti-crawling risk and current circumvention strategy |
| `expectedFailures` | Yes | Known conditions under which it may fail and expected behavior |

Example:

```
[Precipitation Proposal] github/list-repos

- Purpose: Get the public repository list of a specified GitHub user
- I/O Example: Input { username: "octocat" }, Output { repos: [...], count: 8 }
- Value Assessment: High. Reusable by changing username, a common information acquisition sub-task.
- Stability Assessment: High. GitHub API v3 is long-term stable, REST endpoint format changes rarely.
- Anti-crawl Assessment: Low. Uses official API, has rate limit, needs to handle 403/429.
- Expected Failure: Returns empty list when user does not exist; returns 403 when API is rate-limited.
```

### 4.5 Proposal Card Fields to Command Asset Mapping

Fields from the precipitation proposal card should map to specific sections in the command assets:

| Proposal Card Field | Target Document | Target Section |
|-----------|---------|---------|
| `description` | `manifest.json` | `description` |
| `ioExamples` | `README.md` | `## Usage`, `## Return Value` |
| `valueAssessment` | `context.md` | `## Value Assessment` |
| `stabilityAssessment` | `context.md` | `## Environment Dependencies` (stability notes portion) |
| `antiCrawlAssessment` | `context.md` | `## Environment Dependencies` (anti-crawl strategy portion) |
| `expectedFailures` | `README.md` / `context.md` | `## Common Error Codes` (caller perspective) / `## Failure Signals` (fixer perspective) |

### 5. Execute Precipitation

After user confirms the precipitation proposal card, execute according to the complete flow in [references/compile/contract.md](references/compile/contract.md).

> **Prerequisite**: Before execution, you must read contract.md and the corresponding runtime contract document (`node-contract.md` or `playwright-cli-contract.md`) in full. All technical details such as manifest specifications, README/context documentation section requirements, L1-L3 validation rules, runtime signatures and limitations are governed by the contract documents.
