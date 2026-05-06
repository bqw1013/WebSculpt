# Playwright CLI Access Module

## 1. Overview

Playwright CLI (`@playwright/cli`) is a command-line browser automation tool that wraps Playwright's high-level APIs (auto-waiting, smart locators, session management), enabling page navigation, element interaction, and code execution through concise CLI commands.

### Core Mechanisms

- **Snapshot**: After each command execution, the CLI returns a structured snapshot of the current page, containing temporary reference identifiers (refs, such as `e1`, `e2`) for interactive elements.
- **Dual-mode Operation**: You can either quickly interact via native CLI commands (`click`, `fill`, etc.), or execute arbitrary Playwright code for complex logic through `run-code`.
- **Flexible Locating**: Supports three element locating methods: snapshot ref, CSS selector, and Playwright locator.

### Prerequisites Check

Before attempting to connect to the browser, confirm environment readiness in the following order:

1. **Confirm `playwright-cli` is available**
   ```bash
   playwright-cli --version
   ```
   If not installed, guide the user to install it globally:
   ```bash
   npm install -g @playwright/cli
   ```

2. **Check for existing active sessions**
   ```bash
   playwright-cli list
   ```
   Based on output, determine next steps:
   - **If output contains `default: status: open`**: An available session already exists, **skip steps 3-4 and Section 2 (CDP connection)**, proceed directly to in-browser exploration.
   - **If output contains other open sessions (e.g., `chrome`) but no `default`**: Execute `playwright-cli close-all` to close residual sessions, then continue steps 3-4 and perform attach.
   - **If no open sessions exist**: Continue steps 3-4.

3. **Confirm browser remote debugging is enabled** (only execute when new attach is needed)
   Guide the user to open a new tab in Chrome or Edge, visit `chrome://inspect/#remote-debugging`, check **"Allow this browser instance to be remotely debugged"**, and keep the browser open.

4. **Display risk notice** (only execute when new attach is needed)

   Before starting operations, directly display the following notice to the user:

   > Friendly reminder: Some sites have strict detection of browser automation operations, and there is a risk of account suspension. Protective measures are built-in but cannot be completely avoided. Continuing operation implies acceptance.

### Common Commands Quick Reference

The following commands cover the vast majority of automation scenarios:

| Category | Command | Description |
|------|------|------|
| Navigation | `goto <url>` | Navigate to specified address in current page |
| Perception | `snapshot` | Get structured page snapshot |
| Perception | `eval <expression>` | Execute JavaScript expression in page context and return result |
| Interaction | `click <target>` | Click specified element |
| Interaction | `fill <target> <text>` | Fill text into input box |
| Interaction | `type <text>` | Type text on focused element |
| Interaction | `press <key>` | Simulate keyboard key (e.g., `Enter`, `ArrowDown`) |
| Advanced | `run-code "<code>"` | Execute Playwright code snippet, receiving `page` object |
| Output | `screenshot` | Capture current page |

For complete command list and parameter details, refer to `playwright-cli --help` or `playwright-cli <command> --help`.

### Essential Differences Between `eval`, `run-code`, and `snapshot`

| Command | Execution Environment | Purpose | Notes |
|------|---------|------|--------|
| `eval <expr>` | Page JavaScript context (`page.evaluate`) | Quickly probe DOM, extract data | Receives an **expression**, do not add semicolon at the end; cannot directly use `await` |
| `run-code "<code>"` | Playwright Node.js VM context | Complex logic, multi-step interaction | Receives **function body or function expression**; `await`, `page.goto` can be used inside |
| `snapshot` | Page interactive element snapshot | Understand page structure, get temporary ref | Does not return business data, only returns interactive elements |

**Why `eval` succeeds but `run-code` fails**

During exploration, data was successfully extracted using `eval`:
```bash
playwright-cli eval "document.querySelectorAll('article.Box-row').length"
```

But when trying to do the same thing with `run-code`, you may get errors like `too many arguments`, `SyntaxError`, etc.

**The reason is not functional difference, but PowerShell argument passing issues**:

- `eval` is followed by only **one string parameter**, which PowerShell double quotes can correctly wrap
- `run-code` parameters contain spaces, curly braces, semicolons, which PowerShell may split into multiple tokens

**Key conclusion**: When manually testing, if PowerShell quotes don't work, **don't stubbornly persist with `run-code`**. Use `eval` to verify selectors work, and leave complete runner chain testing to websculpt itself (because runner uses `execFile` array parameter passing, unaffected by shell splitting).

### Element Locating Methods

Playwright CLI supports three element locating methods:

1. **Snapshot ref** (default method)
   After executing `snapshot`, interactive elements on the page are assigned temporary reference identifiers, which subsequent commands can directly use to operate elements.

2. **CSS selector**
   Supports locating elements via standard CSS selectors.

3. **Playwright locator**
   Supports locating elements via Playwright's locator API, such as `getByRole`, `getByTestId`, etc.

> **Note**: In `run-code`, use stable selectors (CSS selectors or Playwright locators), do not use temporary refs. Snapshot refs are only valid within a single session and will be reassigned on next execution.

---

## 2. CDP Connection

Playwright CLI **can only attach to an existing browser instance where the user has manually enabled remote debugging via CDP**. This is the only allowed browser connection method in WebSculpt. AI must not use launch, connect, or any equivalent mechanism to create new browser instances or connect to other browser processes.

> **Note**: If step 2 of the prerequisites check already found the `default` session in `open` status, an available connection already exists, **skip this section**, and proceed directly to Section 3 (in-browser exploration).

### Connection Steps

1. **User enables remote debugging**
   In the target browser, open a new tab, visit `chrome://inspect/#remote-debugging`, check **"Allow this browser instance to be remotely debugged"**, and keep the browser open.

   > Chrome and Edge use the same settings entry and process.

2. **Execute attach**

   ```bash
   # Attach to Chrome
   playwright-cli attach --cdp=chrome --session=default
   
   # Attach to Microsoft Edge
   playwright-cli attach --cdp=msedge --session=default
   ```

   After successful connection, the CLI returns the current page snapshot.

### Session Name and Multi-session Management

`playwright-cli attach --cdp=chrome` creates a session name that defaults to the channel name, i.e., `chrome`. But **websculpt runner calls `playwright-cli` without the `--session` parameter, always using the `default` session**.

**Error manifestation**:
```
The browser 'default' is not open, please run open first
```

**Correct approach**:
```bash
# Must close existing same-name sessions first, then re-attach
playwright-cli close-all
playwright-cli attach --cdp=chrome --session=default
```

**Verification**:
```bash
playwright-cli list
# Should see:
# - default: status: open, browser-type: chrome (attached)
```

**Multi-session coexistence risk**

If both `chrome` and `default` attach sessions exist simultaneously, they will compete for the browser's CDP connection, potentially causing intermittent command failures. Before precipitation, always `close-all` and then rebuild a single unique session.

**Background process residue**

Background processes (daemon) may remain on Windows. If attach fails with strange errors, try:
```bash
playwright-cli kill-all
playwright-cli close-all
```
Then re-attach.

### Connection Failure Troubleshooting

If `attach` fails, troubleshoot in the following order:

1. **Confirm remote debugging is enabled**
   Ask the user to confirm the browser is still running, and has visited `chrome://inspect/#remote-debugging` and checked remote debugging. If not enabled, return to the previous step and reconfigure.

2. **Troubleshoot background process conflicts**
   Chrome/Edge uses a multi-process architecture, and background instances may still occupy the debugging port after closing the foreground window. Ask the user to confirm all browser windows (including system tray icons) are closed.

   If confirmed fully closed but still cannot attach, explain the situation to the user and request authorization to terminate all browser processes. After obtaining explicit authorization:
   - Forcefully terminate all Chrome/Edge processes
   - Guide the user to restart the browser and complete the remote debugging setup in step 1
   - Execute `attach` again

   > Forcefully terminating browser processes will lose unsaved tabs and data. Must obtain explicit user authorization before executing.

### Login Scenario Operation Steps

When `snapshot` or `eval` detects target content cannot be obtained due to not being logged in:

1. Clearly explain to the user which website requires login and why, and attach a risk warning: even through CDP reusing an existing browser, automated operations may still be recognized by the website. Recommend users evaluate account risk before deciding whether to log in.
2. Pause automated operations, wait for the user to complete login in the browser.
3. After user confirmation, refresh the page or re-navigate, and continue execution.

Standard script:

> "The current page cannot obtain [specific content] without login. Please log in to [website name] in your browser, and tell me to continue when done."

After user confirms login completion, no need to re-attach, directly continue subsequent operations.

---

## 3. In-browser Exploration Flow

Focus on delivering results to the user, while naturally favoring precipitation-friendly implementation paths. When a precipitation-friendly approach does not significantly increase cost, prioritize it; when it slows down task progress, complete first and assess afterwards.

### Step 1: Quick Probe

After attaching or navigating to the target page, first use `eval` to quickly assess the situation:

- Is target content already in the DOM
- Does interaction need to happen to expose it
- Are there directly extractable data interfaces (JSON-LD, `window.__INITIAL_STATE__`, etc.)
- Does the target element have stable identifiers (id, `data-testid`, aria-label, etc.)

If `eval` is difficult to judge, use `snapshot` to assist in understanding page structure. This step is only responsible for "seeing the situation clearly", not extracting data.

### Step 2: Execute Task

Complete the user request in the most efficient way. The selection criterion is only one: in the current page state, which method is fastest and most stable to get the result.

| Scenario | Recommended Method | Reason |
|------|---------|------|
| Content is in DOM, structure is clear | `eval` | Direct extraction, no interaction needed |
| Interaction needed, and element location is clear | `run-code` | Can handle complex logic and multiple steps |
| Page is complex, elements hard to locate, or need quick trial and error | `snapshot` + native commands | Intuitive, fast, suitable for uncertain scenarios |
| Only need to verify if an element exists | `snapshot` + `click` | Minimum cost verification |

Key principle: **Don't sacrifice current task completion speed to make code "reusable in the future".** The user is waiting for results.

> **PowerShell argument passing trap**: When manually testing `run-code`, if parameters contain spaces, curly braces, or semicolons, PowerShell may split them into multiple tokens causing syntax errors. In this case, prioritize using `eval` to verify selectors, and leave complete logic testing to websculpt runner (`execFile` array parameter passing is unaffected by shell splitting).

### Step 3: Precipitation Assessment (After Task Completion)

After delivering results to the user, if you judge this path has reuse value, assess precipitation cost based on the current implementation form:

| Current Implementation | Precipitation Cost | Action |
|---------|---------|------|
| Pure `eval` extraction | Low | Embed in `run-code`'s `page.evaluate()` |
| `run-code` + stable selectors | None | Direct precipitation |
| `snapshot` + temporary ref / native commands | Medium | Rewrite as `run-code` + stable selectors |
| Mixed path | Medium | Converge to `run-code`, replace temporary refs |

When there is reuse value, execute the corresponding action according to the table above, and precipitate via `command create`.

---

## 4. Technical Facts

The following technical details are frequently involved when writing `eval` expressions and `run-code` scripts.

### Hidden Content in DOM

Pages contain large amounts of loaded but not displayed content — images in non-current frames of carousels, text in collapsed blocks, lazy-loaded placeholder elements, etc. They exist in the DOM but are invisible to users. Thinking in units of data structure (containers, attributes, node relationships) allows direct access to this content.

### Shadow DOM / iframe Boundaries

There are boundaries in the DOM that selectors cannot cross: Shadow DOM's `shadowRoot`, iframe's `contentDocument`, etc. `eval` recursive traversal can penetrate all levels at once, returning structured content with tags; but CSS selectors and Playwright locators cannot cross these boundaries by default and require special handling.

### Scrolling and Lazy Loading

`/scroll` to the bottom triggers lazy loading, causing images not yet in the viewport to finish loading. If not scrolled before extracting image URLs, some images may not yet be loaded, and you will get placeholder addresses.

### URL Completeness and Parameter Preservation

Links generated by site interactions often carry session-related parameters (such as tokens), which are necessary for normal access. When extracting URLs, preserve the complete address, do not truncate or omit parameters. Manually constructed URLs may be missing implicit necessary parameters, leading to interception, returning error pages, or triggering anti-crawling.

### Anti-crawling and Rate Control

- Intensively opening large numbers of pages in a short time (such as batch `tab-new`) may trigger website anti-crawling risk control
- Platform-returned prompts like "content does not exist" or "page is gone" do not necessarily reflect true status, and may also be access method issues (such as URL missing necessary parameters, triggering anti-crawling) rather than content itself issues
- If a task needs to use the user's logged-in session to execute operations, inform the user of risks before starting: using logged-in state for automated operations may still trigger website risk control, recommend avoiding execution on high-value accounts

**Anti-crawling Intensity Assessment**

Target website anti-crawling intensity will directly affect command stability. Before precipitation, assess:
- Whether the page is publicly accessible, whether login is required
- Whether there is obvious automation detection (such as CAPTCHA, behavior fingerprint verification)
- Whether high-frequency calls trigger rate limiting

Current observation: GitHub Trending and other public pages have **low** anti-crawling intensity, no login required, no obvious automation detection. But still avoid consecutive `goto` to more than 3-5 different URLs within the same command.

**Browser Fingerprint Advantage**

CDP attach reuses the user's real browser, User-Agent, Cookie, LocalStorage are all real. This is harder to detect than `launch`ing a new browser, and is the core advantage of playwright-cli in anti-crawling scenarios.

### Media Resource Extraction

When judging content is in images, prioritize using `eval` to directly get image URLs from the DOM, then read directionally — much more precise than full-page screenshots. After obtaining media resource URLs, public resources can be directly downloaded locally for reading; resources requiring login state to obtain are the ones that need in-browser navigation + screenshot.

### Video Content Acquisition

Control `<video>` elements via `eval` (get duration, seek to any time point, play/pause/fullscreen), combined with `screenshot` frame sampling, enabling discrete sampling analysis of video content.

---

## 5. In-page Navigation

### Current Tab Operations

Use `click <target>` to directly click within the current page. Suitable for scenarios requiring continuous operations within the same page, such as click-to-expand, pagination, entering details, etc. Simple and direct, serial processing.

### New Tab Opening

Use `tab-new <url>` to open target links in a new tab. Suitable for scenarios requiring simultaneous access to multiple independent pages. After operations are complete, use `tab-close` to close that tab.

### Link Parameters

Many website links contain session-related parameters; when extracting URLs, preserve the complete address. Manually constructed URLs may be missing implicit necessary parameters.

---

## 6. Environment Cleanliness

### Creating and Closing Tabs

Unless explicitly requested, do not actively operate on the user's existing tabs. Tasks should be performed in background tabs created by `tab-new`, maintaining minimum intrusion into the user's environment. After task completion, use `tab-close` to close self-created tabs.

### Session Management

Playwright CLI reuses the user browser via CDP attach, and the session persists after successful connection. It is not recommended to actively disconnect — re-attaching may require the user to re-authorize remote debugging in the browser.

---

## 7. Troubleshooting

When command execution fails, locate problems in the following layered order:

1. **Infrastructure layer**: `PLAYWRIGHT_CLI_ATTACH_REQUIRED` → Check whether CDP is attached, whether session name is `default`
2. **Syntax layer**: `SyntaxError` → Check whether code has illegal characters, or whether `export default` is missing
3. **Runtime layer**: `EMPTY_RESULT`, `DRIFT_DETECTED` → Check selectors, page loading strategy
4. **Network layer**: `net::ERR_ABORTED`, `TIMEOUT` → Retry once, may be transient

### Direct Command Execution for Debugging

When websculpt error messages are unclear, you can directly execute the precipitated command to view the full error output:

```bash
websculpt <domain> <action> --param-key param-value
```

If the error is still unclear, first execute the following commands to confirm daemon and browser status:

```bash
websculpt daemon status
playwright-cli list
```

Confirm that the `default` session is in `open` status. If the status is abnormal, re-attach according to Section 2 (CDP Connection) of this document.

---

## 8. Windows / PowerShell Notes

### Chained Execution

PowerShell does not support `&&` and `||`:
```powershell
# Wrong
websculpt command validate && websculpt command create

# Correct (execute step by step)
websculpt command validate
websculpt command create
```

### Path Separator

websculpt CLI internally handles both `/` and `\`, but in PowerShell if the path contains spaces, it must be wrapped in quotes. Recommend consistently using `"` double quotes.

### Process Exit Codes

`execFile` behavior on Windows differs slightly from Linux, but websculpt runner has already handled cross-platform differences. The only thing to note is: **background processes (daemon) may remain**. If attach fails with strange errors, try:

```bash
playwright-cli kill-all
playwright-cli close-all
```

Then re-attach.

---

## 9. Command Reference

### Navigation

| Command | Description |
|------|------|
| `goto <url>` | Navigate to specified address in current page |
| `go-back` | Go back to previous page |
| `go-forward` | Go forward to next page |
| `reload` | Reload current page |

### Perception

| Command | Description |
|------|------|
| `snapshot` | Get structured page snapshot, containing temporary ref for interactive elements |
| `snapshot --depth=N` | Limit snapshot depth to save output |
| `eval <expression>` | Execute JavaScript expression in page context and return result |

### Interaction

| Command | Description |
|------|------|
| `click <target>` | Click specified element |
| `fill <target> <text>` | Fill text into input box |
| `type <text>` | Type text on focused element |
| `press <key>` | Simulate keyboard key (e.g., `Enter`, `ArrowDown`) |
| `check <target>` | Check checkbox or radio button |
| `uncheck <target>` | Uncheck |
| `select <target> <value>` | Select option in dropdown |
| `hover <target>` | Hover over specified element |
| `upload <file>` | Upload file |

### Advanced

| Command | Description |
|------|------|
| `run-code "<code>"` | Execute arbitrary Playwright code snippet, receiving `page` object |

### Output

| Command | Description |
|------|------|
| `screenshot [target]` | Capture current page or specified element |
| `pdf` | Save current page as PDF |

### Tabs

| Command | Description |
|------|------|
| `tab-list` | List all open tabs |
| `tab-new [url]` | Create new tab, optionally specifying URL |
| `tab-select <index>` | Switch to tab at specified index |
| `tab-close [index]` | Close tab at specified index, default closes current page |

### Storage

| Command | Description |
|------|------|
| `state-save [file]` | Save cookies and storage state to file |
| `state-load <file>` | Restore cookies and storage state from file |

### Sessions

| Command | Description |
|------|------|
| `list` | List all active browser sessions |
| `close` | Close browser of current session |
| `close-all` | Close browser of all sessions |
