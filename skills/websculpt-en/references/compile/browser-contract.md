# Browser Runtime Contract

> This document defines the authoring specifications for `browser` runtime extension commands.
> For general constraints applicable to all runtimes, see [`./contract.md`](./contract.md).

---

## 1. Function Signature and Module Format

- Entry file: `command.js`
- Standard ESM module, must export an async function via `export default`
- Signature: `async (page, params) => unknown`

`page` is a Playwright `Page` instance, `params` is the parameter object passed by the runner.

- **Do not** write executable code outside the function body.
- Helper functions can be declared inside the function body.

---

## 2. Parameter Passing

- Parameters are directly passed by the runner as the **second argument** of the function
- All parameter values are strings, numbers need to be converted via `parseInt` / `parseFloat`
- Runner has already filled default values according to manifest. Parameters with declared `default` should not have fallback in code (e.g., `params.limit || 3`), parameters without declared `default` handle missing logic themselves
- Boolean values need to be judged yourself: `params.someFlag === "true"`

---

## 3. Return Value

- Directly `return result`, consumed by the daemon and passed back to the CLI
- Returned object must be serializable pure data
- Do not return functions, circular references, `undefined` values, or class instances
- If returning an array is needed, recommend wrapping in object: `return { items: [...] }`

---

## 4. Error Handling

Directly throw `Error`.

Business error codes are passed via `error.code` property, runner will read and pass through. Recommend including error code in error message for readability:

```js
const error = new Error("[NOT_FOUND] User not found");
error.code = "NOT_FOUND";
throw error;
```

For complete semantic list of business error codes, see [`./contract.md`](./contract.md).

---

## 5. Environment Notes

Code is executed via `import()` in the daemon's Node.js process, not an isolated VM.

- **Available**: Standard Node.js built-in modules (`fs`, `path`, etc.) and Playwright API (via `page` parameter)
- **Limitation**: L2 validation only allows importing Node.js built-in modules, third-party modules will be intercepted
- **`console.log`**: Outputs to daemon's stdout. The daemon is a background process, users usually cannot see it. Debug information should be brought out through `return` first
- **Do not** read/write the local file system in commands — commands should only operate the browser

If you need to observe intermediate state, return debug data together:

```js
return { debug: { url: page.url(), title: await page.title() }, items: [] };
```

### Pre-runtime Dependencies

- `browser` commands need a browser environment (CDP connection). If the user has not enabled remote debugging, the runner returns a `BROWSER_ATTACH_REQUIRED` structured error.
- After the user completes setup, call the command again to continue testing, no need to recreate the command.

---

## 6. Minimum Working Template

When precipitating `browser` commands, you can directly reuse the following structure:

```js
// command.js
export default async (page, params) => {
  const limit = parseInt(params.limit, 10);

  // The injected page is shared across concurrent executions.
  // Always create an isolated page and close it in finally.
  page = await page.context().newPage();
  try {
    await page.goto("https://example.com", { waitUntil: "networkidle" });
    await page.waitForSelector(".item", { timeout: 15000 });

    const items = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".item")).map((el) => ({
        title: el.querySelector("h2")?.textContent?.trim() || "",
      }));
    });

    if (items.length === 0) {
      throw new Error("[EMPTY_RESULT] No items found");
    }

    return { items: items.slice(0, limit) };
  } finally {
    await page.close();
  }
};
```

```json
// manifest.json
{
  "runtime": "browser",
  "description": "Fetch items from example.com",
  "parameters": [
    {
      "name": "limit",
      "required": false,
      "default": "10",
      "description": "Max items to return"
    }
  ]
}
```

---

## 7. Complete Example

```js
export default async (page, params) => {
  const author = params.author;
  const limit = parseInt(params.limit, 10);

  // The injected page is shared across concurrent executions.
  // Always create an isolated page and close it in finally.
  page = await page.context().newPage();
  try {
    // Validate parameters
    if (!author) {
      throw new Error('[MISSING_PARAM] Parameter "author" is required.');
    }

    // Navigate and extract data
    await page.goto(
      "https://example.com/search?q=" + encodeURIComponent(author),
      { waitUntil: "networkidle" }
    );

    const data = await page.evaluate(() => {
      const nodes = document.querySelectorAll(".result-item");
      return Array.from(nodes).map((n) => ({
        title: n.querySelector(".title")?.innerText?.trim(),
        url: n.querySelector("a")?.href,
      }));
    });

    // Business error: empty result
    if (data.length === 0) {
      throw new Error("[EMPTY_RESULT] No relevant content found");
    }

    // Return success result
    return { items: data.slice(0, limit) };
  } finally {
    await page.close();
  }
};
```

---

## 8. Best Practices

### `waitForSelector` Cannot Be Omitted

`page.goto`'s `networkidle` only guarantees network requests have quieted down, it does not guarantee front-end frameworks (React/Vue, etc.) have completed hydration and inserted DOM. Before extracting data, explicitly wait for target elements:

```js
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("article.Box-row", { timeout: 15000 });
// Then extract data
```

`waitForSelector` polls the DOM until the element appears or times out, which is more anti-crawling friendly than fixed `sleep`.

### URL Construction

When manually concatenating URLs, parameter values should be encoded using `encodeURIComponent`. Even common language names have no special characters, characters like C++'s `++` must be encoded, otherwise URL parsing will error.

### Selector Stability

Prioritize using framework-level component classes (such as GitHub Primer's `Box-row`) or semantic attributes (`data-testid`, aria-label), avoid using dynamically generated class names. Record fallback positioning strategies to `context.md`, facilitating repair after failure.

### Control Probe Rhythm

High-frequency DOM operations or rapid page turning easily trigger risk control. During exploration, test "at what rhythm the site will refuse to respond", and use this rhythm as the default parameter for the precipitated command. `waitForSelector`'s polling wait is more anti-crawling friendly than fixed `sleep`, but batch calls still need to pay attention to request intervals.

### Tab Isolation

The `browser` runtime daemon shares the same injected `page` object across all concurrent executions. Directly operating on the shared `page` will cause navigation races, DOM pollution, and cross-command data crosstalk.

**All `browser` commands must** create an isolated page at the function start, and close it in `finally`:

```js
export default async (page, params) => {
  page = await page.context().newPage();
  try {
    // ... command logic ...
  } finally {
    await page.close();
  }
};
```

- Reduce risk of accidentally operating on the original shared page in subsequent edits by **reassigning `page`** (rather than introducing new variables like `isolatedPage`).
- `finally` block is mandatory; omitting `page.close()` will cause orphan tabs to accumulate in the daemon, causing memory leaks and polluting `tab-list`.
- Do not close the original injected `page`, otherwise it will break the daemon's current tab state.

---

## 9. Runtime-specific Checklist

General checklist items see Section 5 of [`./contract.md`](./contract.md).

- [ ] Entry file exports async function via `export default`
- [ ] Signature is `async (page, params) => unknown`
- [ ] Boolean parameters judged via `=== "true"`
- [ ] No import of non-Node.js built-in modules

---

## 10. Infrastructure Error Code Reference

The following error codes are automatically generated by the runner / daemon, **do not need** to be thrown in command files:

| Error Code | Meaning |
|--------|------|
| `TIMEOUT` | Command execution timeout (60-second socket timeout) |
| `COMMAND_TIMEOUT` | Command execution exceeds 20-minute safety limit |
| `BROWSER_ATTACH_REQUIRED` | Browser CDP session not attached. Confirm remote debugging is enabled; if confirmed enabled but still errors, may be background process residue, try `playwright-cli kill-all` and `playwright-cli close-all` then re-attach |
| `DAEMON_START_FAILED` | Daemon startup failed |
| `DAEMON_UNREACHABLE` | Daemon started but cannot connect |
| `DAEMON_BUSY` | Daemon concurrent session limit reached |
| `DAEMON_PAGE_LIMIT` | Daemon page count limit reached |
| `DAEMON_RESTARTING` | Daemon is restarting |
| `COMMAND_EXECUTION_ERROR` | Unclassified command execution error |
