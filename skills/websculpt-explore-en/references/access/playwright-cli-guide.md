# Playwright CLI Exploration Guide

> This document only serves the `websculpt-explore` phase: connect to the user's existing browser session, observe pages, complete information acquisition, and record reusable evidence. Do not create captures or install commands in this stage.

## 1. Positioning

`@playwright/cli` is the browser automation tool for the explore phase. It connects to the user's already-open Chrome via CDP attach, reusing the real browser environment's login state, cookies, localStorage, and browser fingerprint.

Applicable scenarios include login-state pages, JS-rendered content, multi-step interactions, tasks that require simulating real user browsing and clicks, and sites where static scraping fails or anti-bot measures are strong.

## 2. Environment Preparation

> Playwright CLI can only attach to existing browser instances; do not launch a new browser.

**The following commands are strictly prohibited in the explore phase:**
- `open [url]` — launches a new browser instance, violating the "attach only" principle
- `install-browser [browser]` — no need to install a browser during the explore phase
- If there is no connectable session during `attach`, follow the steps below to guide the user to establish a connection; **bypassing with `open` is prohibited**

**1. Confirm CLI is installed**

```bash
playwright-cli --version
```

If not installed, guide the user to execute:
```bash
npm install -g @playwright/cli
```

**2. Create an independent session for this explore**

Before running any browser command, generate a unique session name for this explore, for example:

```text
ws-<explore-name>-<short-suffix>
```

Use only lowercase letters, digits, and hyphens. The name should identify the explore workspace and include a short random suffix to avoid conflicts with other tasks. Record it in `BrowserSession.sessionName` and in the Protocol section of `trace.md`; do not change it after attach succeeds.

```bash
playwright-cli list
```

Other sessions in the list may belong to other agents or tasks. Treat them as unrelated resources: do not reuse, close, or clean them up. If the selected name already exists and was not previously created by this explore, generate another name.

Establish the connection as follows:

1. If remote debugging is not already enabled, guide the user to open `chrome://inspect/#remote-debugging` in Chrome, check "Allow remote debugging", and keep the browser open. Do not ask again when it is already enabled.

2. Inform the user of risks:

   ```text
   Some sites strictly detect browser automation, which may trigger account restrictions or bans. WebSculpt reuses the real browser environment and reduces operation frequency where possible, but cannot eliminate this risk.
   ```

3. Use the same unique name for both the CLI session and the attach session:

   ```bash
   playwright-cli -s=<session> attach --cdp=chrome --session=<session>
   ```

   > **Windows note**: `attach` on this platform often appears to hang or time out, although the CDP connection has usually been established in the background.
   > The hang may last several minutes because the daemon performs an initial full snapshot and sends CDP evaluations to all tabs.
   > The `attach` client may also exit with `Session closed` even though the daemon connected successfully.
   > Treat `playwright-cli list` as authoritative: if the selected session exists and is open, attach succeeded.
   > Continue using that session without repeating `attach`.

4. Confirm attach success:

   ```bash
   playwright-cli list
   ```

   The selected session should be open.

Then set `sessionOwned` and `attached` to `true`, and record `Playwright session: <session>` in the Protocol section of `trace.md`.

Except for `playwright-cli list`, every subsequent browser command must explicitly include `-s=<session>`. Supplying `--session` only during attach and then omitting `-s` can route later commands to another session.

## 3. Operation Status Confirmation (BrowserSession)

When `ExploreSession.guideRead` is `true`, append the following status block after ExploreSession at the end of every reply:

```yaml
BrowserSession:
  sessionName: null
  sessionOwned: false
  attached: false
  newTabUsed: false
  ownTabVerified: false
  ownTabsClosed: false
  detached: false
  userRiskAck: false
  antiCrawlDetected: false
  evidenceRecorded: false
```

**Field Descriptions**

- `sessionName`: The unique Playwright CLI session name used by this explore.
- `sessionOwned`: Whether the current explore created this session or confirmed that it belongs to this explore.
- `attached`: Whether a browser session has been successfully attached.
- `newTabUsed`: Whether this explore opened its own page through `tab-new`.
- `ownTabVerified`: Whether the current tab has been confirmed as belonging to this explore by checking its URL/title.
- `ownTabsClosed`: If `newTabUsed` is `true`, confirm all self-created tabs have been closed.
- `detached`: Whether this explore detached from its session after finishing.
- `userRiskAck`: For operations involving login or high risk, whether the user has been informed of risks and confirmed.
- `antiCrawlDetected`: Whether anti-bot or access restriction signals have been observed.
- `evidenceRecorded`: Whether key evidence (URLs, selectors, APIs, steps, failure signals) has been recorded.

**Key Rules**

- `sessionOwned` is `false` → do not reuse, close, or detach that session.
  The session list may contain connections owned by other agents or tasks; an existing name does not grant ownership.

- `attached` is `false` → prohibit any page operations.
  Executing commands without attaching will directly error, or accidentally operate the user's locally opened browser instance, causing unexpected page navigation or data loss.

- `newTabUsed` is `false` → prohibit operating on the user's existing tabs.
  Reusing the user's tabs will pollute their browsing state, possibly overwriting or closing content they are currently viewing, violating the "do not disturb the user" principle.

- `ownTabVerified` is `false` → do not navigate, interact with, or close the current tab.
  After `tab-new <url>`, read the current URL/title to verify ownership. Do not infer ownership from a global tab index that may change.

- `newTabUsed` is `true` → `ownTabsClosed` must be `true` before final delivery or the end of the explore.
  Tabs left unclosed will continuously occupy browser resources, long-term accumulation will cause user browser chaos, and may leak context for subsequent tasks.

- If the explore attached, `detached` must be `true` when the explore ends.
  After closing the self-created tab, detach only this session; do not close the browser or clean up other sessions.

- `userRiskAck` is `false` → prohibit continuing login or high-risk operations.
  Automated operations without the user's informed consent may trigger platform risk control, leading to user account bans or privacy leaks.

- `antiCrawlDetected` is `true`, must synchronously execute slowdown measures.
  Not slowing down will aggravate the site's anti-bot response, possibly leading to IP bans, account restrictions, or permanent loss of access to that site.

- `evidenceRecorded` is `false` → prohibit delivering exploration results.
  Exploration without recorded evidence cannot be reused by capture, meaning the verified path cannot be converted into a subsequent reusable capability, done for nothing.

## 4. Common Commands

> When any command's parameters or behavior are uncertain, use `playwright-cli --help <command>` to view the full signature and available options. This is the most efficient and accurate usage source, prioritized over guessing or memory.

In the table below, always replace `<session>` with `BrowserSession.sessionName`. Do not omit `-s=<session>` except when running `list`.

Playwright CLI commands are divided into the following categories by function. Each category usually contains multiple subcommands. The explore phase mainly uses commands in the Core, Tabs, and Navigation categories, but when encountering specific needs (such as viewing network requests, operating cookies, generating element locators), you can first locate the corresponding category, then use `--help` to view the complete commands under that category.

| Category | Typical Usage |
|----------|-------------|
| Core | Page navigation, snapshots, element interaction, form filling |
| Navigation | Forward, backward, refresh |
| Keyboard / Mouse | Keyboard input, mouse movement, scrolling, dragging |
| Save as | Screenshots, saving PDFs |
| Tabs | New, close, switch tabs |
| Storage | Read/write cookies, localStorage, sessionStorage |
| Network | View requests/responses, intercept network, set offline status |
| DevTools | Execute Playwright code, view console, generate locators |
| Browser sessions | Session list, attach, and detach |

The following are frequently used commands in the explore phase for quick reference:

| Type | Command | Usage |
|------|---------|-------|
| Navigation | `playwright-cli -s=<session> goto <url>` | Open a target page in the current session tab |
| Perception | `playwright-cli -s=<session> snapshot [target]` | Get a structured page snapshot and temporary ref |
| Perception | `playwright-cli -s=<session> eval <func> [target]` | Probe the DOM or extract data in page context |
| Interaction | `playwright-cli -s=<session> click <target> [button]` | Click an element |
| Interaction | `playwright-cli -s=<session> fill <target> <text>` | Enter text |
| Interaction | `playwright-cli -s=<session> press <key>` | Press a key |
| Advanced | `playwright-cli -s=<session> run-code [code]` | Execute complex Playwright logic |
| Output | `playwright-cli -s=<session> screenshot [target]` | Take a screenshot |
| Tabs | `playwright-cli -s=<session> tab-new [url]` | Create and select the tab owned by this session |
| Tabs | `playwright-cli -s=<session> tab-close` | Close the current tab of this session |

## 5. Exploration and Evidence

### Quick Probing

**Structure confirmation takes precedence over data extraction**: first clarify the position of result elements, their semantics, and structural changes under different states, then write extraction logic.

After entering the target page, simultaneously complete status judgment and clue identification:

- Whether target content is already in the DOM.
- Whether scrolling, clicking, searching, pagination, or login is needed.
- Whether JSON-LD, `window.__INITIAL_STATE__`, embedded script data, or API response clues exist.
- Whether target elements have stable identifiers, such as id, `data-testid`, aria label, stable class, or semantic structure.

Prioritize using `eval` for small-step validation. `snapshot` is used to understand interactive elements and page structure. During probing, casually record discovered stable clues; do not wait until the task ends to supplement.

### Loading Timeout Troubleshooting

If `goto` results in a page that is unresponsive or times out for a long time, consider the following troubleshooting strategies:

- Try `--wait-until=domcontentloaded` instead of the default strategy, to rule out the possibility of third-party ad/tracking scripts blocking page load.
- Then use `wait-for <selector>` to explicitly wait for the target element to appear, rather than relying on all resources to finish loading.

### Execute Task

Choose the fastest and most stable way to complete the user's request:

| Scenario | Recommended Method |
|----------|------------------|
| Content is in DOM and structure is clear | `eval` |
| Data comes from API rather than directly rendered in DOM | `requests` + `response-body` |
| Requires multi-step interaction | `run-code` or snapshot + native commands |
| Page is complex and requires rapid trial and error | `snapshot` + `click` / `fill` / `press` |
| Only need to verify whether element exists | `eval` or `snapshot` |

Do not block task delivery in pursuit of "perfect recording". Key evidence is casually noted during execution; only make final decisions in the Capture Assessment afterwards.

### Record While Executing

During exploration, in real time record the following evidence to preserve reusable paths for subsequent capture:

- **Original URL and necessary query parameters**.
- **API endpoint, request parameters, and response fields** — prioritize recording stable interfaces rather than fragile DOM.
- **DOM selectors and page structure** — use id, `data-testid`, aria label, stable class, and other reconstructable identifiers. Snapshot ref is only valid in the current session; do not use it as reusable evidence.
- **Sample input and sample output**.
- **Necessary steps**, such as login, pagination, scrolling, lazy loading.
- **Failure signals**, such as CAPTCHA, login wall, empty results, structural drift, rate limiting.

## 6. Login and Account Risk

> Reusing the user's real browser's login state is one of the core advantages of Playwright CLI. If the page requires login, **do not switch to curl or WebFetch because the process is cumbersome**. Just guide the user to complete it following the steps below.

When the page requires login to continue:

1. Tell the user which website needs login and why. Standard script:

   ```text
   The current page cannot obtain [specific content] in an unlogged-in state. Please log in to [website name] in your browser, and tell me to continue when done.
   ```

2. Explain that automated use of login state may trigger risk control.
3. Pause automation and let the user manually log in in the browser. **Do not ask for or handle the user's password.**
4. After user confirmation, refresh or re-navigate to continue.

## 7. Anti-Bot and Rate Control

If the page shows CAPTCHA, 403/429, content is human-visible but automation retrieval is empty, continuous requests cause abnormal redirects, or extra verification is required, it indicates anti-bot or access restrictions. At this time you should:

- Reduce operation frequency
- Prioritize reusing the user's real browser session
- Avoid opening a large number of detail pages in a short time
- Preserve complete URL, do not crop session-related parameters
- Let the user confirm before high-risk account operations

## 8. Performance and Speed

After a browser session has been attached for a long time, Chrome memory and CDP connection overhead will continuously accumulate, causing operations to slow down or even freeze the system. The following practices can alleviate performance degradation **without re-attaching** or **closing the session**.

### `eval` over `snapshot`

`snapshot` triggers a full-page ARIA snapshot; the daemon needs to traverse the entire DOM tree and serialize it to text, which is data-heavy and CPU-intensive. Only use `snapshot` in the following situations:

- First entering an unfamiliar page, needing to understand the interactive element structure.
- After executing clicks, fills, or pagination that may change the page structure.

For all other situations (checking whether an element exists, extracting known fields, verifying text content, getting simple attributes), always use `eval`. `eval` only executes a small amount of JavaScript and returns lightweight results, putting far less pressure on the browser and daemon than `snapshot`.

### `goto about:blank` as task buffer

After completing information extraction on a page, there is no need to immediately `tab-close` and create a new tab. First navigate the current tab to a blank page:

```bash
playwright-cli -s=<session> goto about:blank
```

This encourages Chrome to release the previous page's rendering process, V8 Heap, and GPU textures, and is lighter than `tab-new` / `tab-close`. After buffering, you can directly use `goto <url>` to continue the next task; **no re-attachment is needed**.

### Maintain one self-created tab

The more tabs opened simultaneously, the greater the Chrome rendering process overhead, and **every command** (including read-only commands like `tab-list`) executes a `headerSnapshot()` poll on all existing tabs. Recommendations:

- **Maintain exactly one self-created tab per explore session.**
- Prefer the current tab of this session; do not rely on global indexes returned by `tab-list`.
- For consecutive tasks under the same site, if currently already in a **self-created tab**, prefer using `goto` to switch URLs rather than creating additional new tabs.
- If a page interaction unexpectedly opens a new tab, treat it as a resource created by this explore. Verify its URL/title, handle or close it, and do not keep two tabs open.

### Batch operations to reduce command count

Since every command sends a round of CDP evaluations to **all** attached tabs, the more commands you issue, the higher the chance that one unresponsive tab blocks the whole command. Prefer combining multi-step operations into a single `run-code` / `eval` execution instead of splitting them into many small commands.

## 9. Environment Cleanliness

- **Do not reuse the user's existing tabs.** Reusing user tabs will pollute their browsing state, violating the "do not disturb the user" principle.
- **AI self-created tabs can be reused through `goto` during task gaps** to reduce `tab-new` overhead; after the task ultimately ends, you must close the tabs you created.
- Treat every other session as an unrelated resource regardless of status. Do not reuse, close, or detach it.

At the end of the task, clean up only the resources owned by this explore, in this order:

```bash
playwright-cli -s=<session> eval "() => ({ url: location.href, title: document.title })"
playwright-cli -s=<session> tab-close
playwright-cli -s=<session> detach
```

When no index is supplied, `tab-close` closes the current tab of this session, avoiding accidental closure caused by changing global tab indexes. If URL/title cannot confirm that the current tab belongs to this explore, do not close it; still detach this session and report the leftover tab to the user.

If this session is unhealthy, first inspect connection status:

```bash
playwright-cli list
```

Only detach and re-attach the session owned by the current explore. After re-attaching, set `ownTabVerified` to `false` and verify URL/title again before any page operation. Do not use `close`, `close-all`, or `kill-all` for ordinary recovery; those commands may close the user's browser or sessions owned by other tasks. Re-attaching the current session also has limited value when the fault is in Chrome itself, such as a frozen tab (see Section 10).

## 10. Troubleshooting

### Commands Keep Timing Out (session open but eval/snapshot unresponsive)

**Symptoms**: `attach` reports success and `playwright-cli list` shows the session open, but all subsequent browser commands that include `-s=<session>` (`eval`, `snapshot`, `goto`, etc.) time out. Detaching and re-attaching the current session does not fix the issue.

**Root cause**: After Chrome runs for an extended period, its CDP WebSocket service may degrade and become unresponsive. The TCP port still shows as Listening, but the CDP protocol layer is dead. The daemon can start but cannot communicate with the browser.

**Diagnosis**: Locate Chrome's `DevToolsActivePort` file (typically under the Chrome user data directory), read the port number from the first line and the browser path ID from the second line, then verify CDP liveness:

```bash
curl -i -N -m 10 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:<port>/devtools/browser/<id>
```

- Returns `101 WebSocket Protocol Handshake` → CDP is healthy, the issue lies elsewhere
- Connection refused, no response, or handshake failure → **CDP is degraded**, Chrome restart required

> Note: `/json/*` HTTP endpoints (e.g., `/json/version`) may return 404 when debugging is enabled via the `chrome://inspect` UI. **Do not** treat this as a degraded CDP; the WebSocket handshake is the authoritative check.

> The `DevToolsActivePort` path varies by platform — use `find`/`ls` to locate it, or infer from the platform's Chrome user data directory convention. This file is written by Chrome when remote debugging is enabled.

**Fix**: Tell the user that Chrome's remote debugging service has become unresponsive. They need to restart Chrome, re-enable remote debugging (`chrome://inspect/#remote-debugging`), then re-attach using the original session name. Cleaning up Playwright CLI sessions cannot substitute for restarting Chrome.

### Commands Take Minutes But Eventually Succeed

**Symptoms**: Commands do not error, but each one hangs for 1-5 minutes before returning the correct result; after running several commands in a row, response times become progressively shorter until they return in seconds. Common after Chrome has been running for a long time with many tabs.

**Possible causes** (not fully verified): Background tabs are being throttled or frozen by Chrome or the OS (e.g., Windows 11 Efficiency Mode, Chrome Energy Saver). Because every CLI command sends CDP evaluations to all tabs, a single unresponsive tab blocks the entire command. The slow command itself may wake the frozen tab, so repeated execution appears to self-heal. When this happens again, open `chrome://discards` to inspect each tab's Lifecycle State, or check whether Chrome renderer processes are marked as Efficiency Mode in Task Manager.

**Remediation** (try in order; none of these manipulate the user's tabs):

1. **Warm-up retry**: Run 2-3 lightweight `eval` commands on the current session's self-created tab and accept that the first may take minutes; it also acts as the thawing process, and subsequent commands usually recover.
2. **Detach and re-attach the current session**: If warm-up does not help, rebuild only this explore's connection.
3. **Ask the user to restart Chrome**: If the above fails, instruct the user to restart Chrome and re-enable remote debugging.

---

## 11. PowerShell Notes

PowerShell is unfriendly to complex quotes and curly braces. If `run-code` errors due to parameter passing, prioritize switching to `eval` to verify selectors and data structures; do not dwell on it repeatedly; complex runner logic is left for the subsequent `websculpt-capture` phase to implement through command files.
