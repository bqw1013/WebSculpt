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

**2. Check and handle sessions**

```bash
playwright-cli list
```

Choose the corresponding operation based on output:
- `default: status: open` exists → reuse that session directly
- Other open sessions exist but no `default` → close residual sessions first, then re-attach
- No open sessions → establish connection following these steps:

  1. Guide the user to open `chrome://inspect/#remote-debugging` in Chrome, check "Allow remote debugging", and keep the browser open

  2. Inform the user of risks:

     ```text
     Some sites have strict browser automation detection, and there is a risk of account risk control or banning. WebSculpt will try to reuse the real browser environment and reduce operation frequency, but it cannot completely avoid risks.
     ```

  3. Attach to the default session:

     ```bash
     playwright-cli attach --cdp=chrome --session=default
     ```

     > **Windows note**: `attach` on this platform often appears to hang or time out, but the CDP connection is usually already established in the background.
     > The hang may last several minutes (after startup, the daemon automatically performs a full snapshot and sends CDP evaluations to all tabs);
     > the `attach` client process may also exit with a `Session closed` error, but the daemon has often already connected.
     > In all cases, trust `playwright-cli list`: if the `default` session already exists, the connection is successful and subsequent commands can be used directly without repeating `attach` or giving up because of the error.

  4. Confirm attach success:

     ```bash
     playwright-cli list
     ```

     You should see the `default` session in open status.

## 3. Operation Status Confirmation (BrowserSession)

When `ExploreSession.guideRead` is `true`, append the following status block after ExploreSession at the end of every reply:

```yaml
BrowserSession:
  attached: false
  newTabUsed: false
  ownTabsClosed: false
  userRiskAck: false
  antiCrawlDetected: false
  evidenceRecorded: false
```

**Field Descriptions**

- `attached`: Whether a browser session has been successfully attached.
- `newTabUsed`: Whether a new page has been opened via `tab-new` this time (executed at least once is `true`, quantity is not tracked).
- `ownTabsClosed`: If `newTabUsed` is `true`, confirm all self-created tabs have been closed.
- `userRiskAck`: For operations involving login or high risk, whether the user has been informed of risks and confirmed.
- `antiCrawlDetected`: Whether anti-bot or access restriction signals have been observed.
- `evidenceRecorded`: Whether key evidence (URLs, selectors, APIs, steps, failure signals) has been recorded.

**Key Rules**

- `attached` is `false` → prohibit any page operations.
  Executing commands without attaching will directly error, or accidentally operate the user's locally opened browser instance, causing unexpected page navigation or data loss.

- `newTabUsed` is `false` → prohibit operating on the user's existing tabs.
  Reusing the user's tabs will pollute their browsing state, possibly overwriting or closing content they are currently viewing, violating the "do not disturb the user" principle.

- `newTabUsed` is `true` → `ownTabsClosed` must be `true` before the reply ends.
  Tabs left unclosed will continuously occupy browser resources, long-term accumulation will cause user browser chaos, and may leak context for subsequent tasks.

- `userRiskAck` is `false` → prohibit continuing login or high-risk operations.
  Automated operations without the user's informed consent may trigger platform risk control, leading to user account bans or privacy leaks.

- `antiCrawlDetected` is `true`, must synchronously execute slowdown measures.
  Not slowing down will aggravate the site's anti-bot response, possibly leading to IP bans, account restrictions, or permanent loss of access to that site.

- `evidenceRecorded` is `false` → prohibit delivering exploration results.
  Exploration without recorded evidence cannot be reused by capture, meaning the verified path cannot be converted into a subsequent reusable capability, done for nothing.

## 4. Common Commands

> When any command's parameters or behavior are uncertain, use `playwright-cli --help <command>` to view the full signature and available options. This is the most efficient and accurate usage source, prioritized over guessing or memory.

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
| Browser sessions | Session list, cleanup residuals |

The following are frequently used commands in the explore phase for quick reference:

| Type | Command | Usage |
|------|---------|-------|
| Navigation | `goto <url>` | Open target page |
| Perception | `snapshot [target]` | Get page structured snapshot and temporary ref |
| Perception | `eval <func> [target]` | Quickly probe DOM or extract data in page context |
| Interaction | `click <target> [button]` | Click element |
| Interaction | `fill <target> <text>` | Input text |
| Interaction | `press <key>` | Press key |
| Advanced | `run-code [code]` | Execute complex Playwright logic |
| Output | `screenshot [target]` | Screenshot |
| Tabs | `tab-new [url]` | New tab |
| Tabs | `tab-close [index]` | Close tab |

## 5. Exploration and Evidence

### Quick Probing

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
playwright-cli goto about:blank
```

This encourages Chrome to release the previous page's rendering process, V8 Heap, and GPU textures, and is lighter than `tab-new` / `tab-close`. After buffering, you can directly use `goto <url>` to continue the next task; **no re-attachment is needed**.

### Control concurrent tabs

The more tabs opened simultaneously, the greater the Chrome rendering process overhead, and **every command** (including read-only commands like `tab-list`) executes a `headerSnapshot()` poll on all existing tabs. Recommendations:

- **Self-created tabs open simultaneously should not exceed 2.**
- Periodically execute `tab-list` to check and promptly close tabs for completed tasks.
- For consecutive tasks under the same site, if currently already in a **self-created tab**, prefer using `goto` to switch URLs rather than creating additional new tabs.

### Batch operations to reduce command count

Since every command sends a round of CDP evaluations to **all** attached tabs, the more commands you issue, the higher the chance that one unresponsive tab blocks the whole command. Prefer combining multi-step operations into a single `run-code` / `eval` execution instead of splitting them into many small commands.

## 9. Environment Cleanliness

- **Do not reuse the user's existing tabs.** Reusing user tabs will pollute their browsing state, violating the "do not disturb the user" principle.
- **AI self-created tabs can be reused through `goto` during task gaps** to reduce `tab-new` overhead; after the task ultimately ends, you must close the tabs you created.
- Do not actively disconnect an available `default` session.

If attach status is abnormal, first check connection status:

```bash
playwright-cli list
```

If still unable to recover, clean up sessions and re-establish connection:

```bash
playwright-cli close-all
# or
playwright-cli kill-all
```

After cleanup completes, re-attach following the steps in Section 2 "Environment Preparation".

> Note: close + re-attach only rebuilds the daemon (clears daemon-side state) and does not affect Chrome itself. If the problem lies on the Chrome side (e.g., tabs are frozen; see Section 10), this operation has limited effect.

> Forcibly terminating browser processes may lose user data; you must obtain the user's explicit authorization first.

## 10. Troubleshooting

### Commands Keep Timing Out (session open but eval/snapshot unresponsive)

**Symptoms**: `attach` reports success, `playwright-cli list` shows session open, but all subsequent browser commands (`eval`, `snapshot`, `goto`, etc.) time out. Rebuilding the daemon via `close` + `attach` does not fix the issue.

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

**Fix**: Tell the user that Chrome's remote debugging service has become unresponsive. They need to restart Chrome, re-enable remote debugging (`chrome://inspect/#remote-debugging`), then re-attach. `close`/`kill-all`/re-`attach` cannot substitute for restarting Chrome.

### Commands Take Minutes But Eventually Succeed

**Symptoms**: Commands do not error, but each one hangs for 1-5 minutes before returning the correct result; after running several commands in a row, response times become progressively shorter until they return in seconds. Common after Chrome has been running for a long time with many tabs.

**Possible causes** (not fully verified): Background tabs are being throttled or frozen by Chrome or the OS (e.g., Windows 11 Efficiency Mode, Chrome Energy Saver). Because every CLI command sends CDP evaluations to all tabs, a single unresponsive tab blocks the entire command. The slow command itself may wake the frozen tab, so repeated execution appears to self-heal. When this happens again, open `chrome://discards` to inspect each tab's Lifecycle State, or check whether Chrome renderer processes are marked as Efficiency Mode in Task Manager.

**Remediation** (try in order; none of these manipulate the user's tabs):

1. **Warm-up retry**: Execute 2-3 lightweight commands (e.g., `tab-list`) and accept that the first one may take minutes — it is also the thawing process; subsequent commands usually recover on their own.
2. **close + re-attach**: If warm-up does not help, use this to clear accumulated daemon-side state.
3. **Ask the user to restart Chrome**: If the above fails, instruct the user to restart Chrome and re-enable remote debugging.

---

## 11. PowerShell Notes

PowerShell is unfriendly to complex quotes and curly braces. If `run-code` errors due to parameter passing, prioritize switching to `eval` to verify selectors and data structures; do not dwell on it repeatedly; complex runner logic is left for the subsequent `websculpt-capture` phase to implement through command files.
