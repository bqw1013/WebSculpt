# Playwright CLI Exploration Guide

> This document only serves the `websculpt-explore` phase: connect to the user's existing browser session, observe pages, complete information acquisition, and record reusable evidence. Do not create captures or install commands in this stage.

## 1. Positioning

`@playwright/cli` is the browser automation tool for the explore phase. It connects to the user's already-open Chrome or Edge via CDP attach, reusing the real browser environment's login state, cookies, localStorage, and browser fingerprint.

Applicable scenarios include login-state pages, JS-rendered content, multi-step interactions, tasks that require simulating real user browsing and clicks, and sites where static scraping fails or anti-bot measures are strong.

## 2. Environment Preparation

> Playwright CLI can only attach to existing browser instances; do not launch a new browser.

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

  1. Guide the user to open `chrome://inspect/#remote-debugging` in Chrome or Edge, check "Allow remote debugging", and keep the browser open

  2. Inform the user of risks:

     ```text
     Some sites have strict browser automation detection, and there is a risk of account risk control or banning. WebSculpt will try to reuse the real browser environment and reduce operation frequency, but it cannot completely avoid risks.
     ```

  3. Attach to the default session:

     ```bash
     playwright-cli attach --cdp=chrome --session=default
     ```

     Or:

     ```bash
     playwright-cli attach --cdp=msedge --session=default
     ```

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

## 8. Environment Cleanliness

- **Create new pages through `tab-new` for any task; do not reuse the user's existing tabs.**
- **Must close tabs you created after the task ends.**
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

> Forcibly terminating browser processes may lose user data; you must obtain the user's explicit authorization first.

## 9. PowerShell Notes

PowerShell is unfriendly to complex quotes and curly braces. If `run-code` errors due to parameter passing, prioritize switching to `eval` to verify selectors and data structures; do not dwell on it repeatedly; complex runner logic is left for the subsequent `websculpt-capture` phase to implement through command files.
