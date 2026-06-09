# WebSculpt

<p align="center">
  <img src="docs/assets/header-logo-black.png" width="100%" alt="WebSculpt">
</p>

[![npm version](https://img.shields.io/npm/v/websculpt)](https://www.npmjs.com/package/websculpt)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/node/v/websculpt)](package.json)
[![npm downloads](https://img.shields.io/npm/dm/websculpt)](https://www.npmjs.com/package/websculpt)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)

[English](README.md) · [中文](README_zh.md)

> **Every time a conversation ends, the Agent's web-surfing experience resets to zero.**
>
> Next week when you check the same website again, it starts from scratch—figuring out page structure, anti-bot measures, login flows—filling up the context window with exploration noise, leaving no room for the actual analysis.

**WebSculpt is the Agent's procedural memory.** It doesn't remember knowledge; it remembers the proven experience of "how to get data from a specific website." Through Harness, it constrains exploration behavior and distills successful paths into locally reusable `domain/action` commands; subsequent tasks invoke them directly, freeing up context space. The command library evolves with use, making the Agent smarter over time.

![WebSculpt Workflow](docs/assets/flow-en.svg)

> Demo video (Chinese)

<video src="https://github.com/bqw1013/WebSculpt/raw/master/docs/assets/WebSculpt-DeepSeek-Final-zh.mp4" controls width="100%"></video>

---

## Contents

- [1. Install](#1-install)
- [2. Usage](#2-usage)
- [3. Why WebSculpt](#3-why-websculpt)
- [4. Core Concepts](#4-core-concepts)
- [5. Key Design Choices](#5-key-design-choices)
- [6. Documentation](#6-documentation)
- [7. Usage Statement](#7-usage-statement)
- [8. License](#8-license)

---

## 1. Install

**Prerequisites**: Node.js >= 22

```bash
# 1. Install CLI tool
npm install -g @playwright/cli@0.1.12 websculpt

# 2. Install Skill for Agent (includes explore, capture, scope)
websculpt skill install --lang en       # Current project
# websculpt skill install --global --lang en   # Global scope
```

## 2. Usage

### 2.1 Agent Conversation Mode

After installing the Skill, simply describe your needs to the Agent. The Agent will automatically check the command library, explore information, and assess whether it's worth distilling.

**First-time Exploration and Distillation**

> **You**: Check Hacker News top stories for me.
>
> **Agent**: No match in local command library. Accessing Hacker News... Located top stories nodes, extracted data. Suggest distilling it into `hackernews/get-top` for direct future use. Confirm?
>
> **You**: Confirm.
>
> **Agent**: Distilled. Current top stories:
> ```json
> [
>   { "rank": 1, "title": "...", "points": 420 },
>   { "rank": 2, "title": "...", "points": 315 }
> ]
> ```

**Reusing Existing Commands**

> **You** (days later): Check the top 5 stories on Hacker News for me.
>
> **Agent**: Invoking `hackernews/get-top --limit 5`. Results returned in seconds, zero extra token consumption.

For websites requiring login state (such as GitHub, personal pages), the Agent will automatically connect to your currently open Chrome browser and fetch data through the existing session, without re-logging in.

### 2.2 CLI Manual Mode

```bash
# View all available commands
websculpt command list

# Zero-dependency commands (no browser needed)
websculpt hackernews get-top --limit 5

# Browser commands (reuse Chrome login state, keep browser open)
websculpt github get-trending --language python --period weekly

# Meta commands
websculpt daemon start|status|stop
websculpt command remove <domain> <action>
```

### 2.3 Managing Command Context (Scope)

As the command library grows, you can use Scope to limit which commands are visible to the current project, keeping the Agent's context clean.

```bash
# Initialize project-level whitelist (isolates global commands)
websculpt scope init

# Add commands needed for the current project
websculpt scope add hackernews          # Add entire domain
websculpt scope add hackernews get-top  # Or add a single command
```

---

## 3. Why WebSculpt

**Agent browsing the web with no memory, like it's the first time every time?**

Checking the same website repeatedly, the Agent has to re-analyze page structure and trial-and-error selectors from scratch each time. Context is consumed by exploration noise, and complex multi-page navigation breaks mid-chain. WebSculpt solidifies proven paths into local commands—explore once, reuse forever, zero repeat cost, stable and predictable results.

**Setting up a browser environment is harder than getting the Agent to work?**

Playwright, Puppeteer, CDP configuration docs are overwhelming, and you don't want to hand your credentials to third-party cloud APIs. WebSculpt converges browser automation into a single protocol. The Agent connects directly to your currently open Chrome, reusing login state and cookies—balancing automation and privacy.

**Want to turn daily queries into scripts or workflows?**

Distilled commands output structured JSON, directly callable by scripts, CI pipelines, or other systems. Your daily operations become a stable API.

## 4. Core Concepts

**Command System**

WebSculpt has two types of commands:
- **Meta commands**: Manage the CLI itself and the command library, such as `explore`, `capture`, `command`, `skill`, `scope`. Built into the system, cannot be overridden.
- **Extended commands**: Reusable information retrieval workflows, invoked by `domain/action` (e.g., `hackernews/get-top`). Further divided into:
  - **Builtin commands**: Distributed with WebSculpt
  - **User commands**: Distilled by the Agent into `~/.websculpt/commands/`. User commands have higher priority than Builtin, automatically overriding on name collision—the command library evolves with use.

**Lifecycle**

- **Explore**: The Agent's process of retrieving information. First checks the local command library to reuse existing paths; if no match, explores new paths via external tools.
- **Capture**: The process of solidifying a proven path into a command. The Agent automatically advances the workflow; users only need to confirm the name and input/output.

**Execution Environment (Runtime)**

- `node`: HTTP requests and data cleansing, zero dependencies
- `browser`: Connects to your currently open Chrome via Playwright, reusing your login state and cookies

**Command Isolation (Scope)**

As the command library grows, you can use `scope` to restrict the current project to only see specific command sets, reducing interference from irrelevant commands on the Agent. Scope configuration is stored locally in the project; global commands are isolated by default and only become visible after explicitly added.

---

## 5. Key Design Choices

### Three-Phase Skill Delivery

WebSculpt's complete functionality is divided into three sequentially connected Skills, directly delivered to the user's Agent:
- `websculpt-explore`: Information retrieval phase, discovering reusable paths
- `websculpt-capture`: Distillation phase, solidifying proven paths into commands
- `websculpt-scope`: Context management phase, isolating irrelevant commands to keep the Agent's context clean

This is not loose usage advice, but deliverables containing complete protocols, state constraints, and delivery standards.

### Explore: Document Soft Constraints + Filesystem Truth

`websculpt-explore` first constrains the Agent's tool selection: must check the library and reuse builtin commands first, only allowed to explore new paths when no match; when browser automation is needed, converges to the single protocol of Playwright CDP connecting to the current browser.

Constraints are enforced through two mechanisms:
- **Document soft constraints**: Skill documents define protocol flows; the Agent follows rules to execute
- **Filesystem truth**: The Agent writes exploration traces to `trace.md`; `explore assess` performs structured audits (heading completeness, non-empty content, keyword safety rules, Assessment H3 subsection checks), blocking entry to capture until passed

### Capture: CLI State Checks + Artifact Pipeline

`websculpt-capture` further introduces CLI hard constraints on top of explore's constraints:
- The Agent doesn't need to understand the complete flow, only needs to loop executing `capture status`, advancing according to the returned `next.action`
- The distillation process is split into 6 Artifacts, advancing with strict layered dependencies
- Hard gates are established through Evidence Audit, Draft Fingerprint, and 4 sets of real tests; cannot finalize until all are passed

---

## 6. Documentation

**Usage**
- [`docs/CLI.md`](docs/CLI.md) — Usage, parameters, and output contracts for all commands

**Design and Implementation**
- [`docs/Capture.md`](docs/Capture.md) — Distillation workflow: six-artifact pipeline, state machine, hard-gate installation
- [`docs/Architecture.md`](docs/Architecture.md) — Four-layer system architecture and code organization
- [`docs/Daemon.md`](docs/Daemon.md) — Background browser process, IPC protocol, and resource management

---

## 7. Usage Statement

When using WebSculpt, please comply with the target website's robots.txt and Terms of Service. Use it only on publicly accessible data you are permitted to access; unauthorized data collection is prohibited.

## 8. License

Apache-2.0

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=bqw1013/WebSculpt&type=Date)](https://star-history.com/#bqw1013/WebSculpt&Date)
