# playwright-cli Runtime Contract

> This document defines the authoring specifications for `playwright-cli` runtime extension commands.
> For general constraints applicable to all runtimes, see [`./contract.md`](./contract.md).

---

## 1. Function Signature

Code executes in the context provided by `playwright-cli run-code`, with direct access to the `page` object (Playwright `Page` instance). Write in the following form:

```js
async function (page) {
  /* PARAMS_INJECT */
  // ... your logic
}
```

- **Do not** write executable code outside the function body.
- Helper functions can be declared inside the function body.

---

## 2. Parameter Injection

### Placeholder

Runner will replace `/* PARAMS_INJECT */` in the file with a line of parameter declaration before execution:

```js
const params = {"limit":"3","author":"demo-author"};
```

Therefore your code **must retain** this placeholder, and read parameters via `params.key`.

### Why the Placeholder Must Be Inside the Function Body

When `playwright-cli` daemon executes `run-code`, the core logic is roughly:

```js
const fn = vm.runInContext("(" + code + ")", context);
const result = await fn(page);
```

The entire `code` string is wrapped in a pair of parentheses `()`. The valid wrapping result must be an **expression**.

**Wrong写法** (placeholder outside function body):

```js
/* PARAMS_INJECT */
async function (page) {
  // logic
}
```

After runner replacement becomes:

```js
const params = {"limit":"10"};
async function (page) {
  // logic
}
```

Wrapped by daemon:

```js
(const params = {"limit":"10"}; async function (page) { ... })
```

This is illegal in JS syntax — `const` declarations cannot appear in expression context, will report `SyntaxError: Unexpected token 'const'`.

**Correct写法**:

```js
async function (page) {
  /* PARAMS_INJECT */
  // logic
}
```

After runner replacement:

```js
async function (page) {
  const params = {"limit":"10"};
  // logic
}
```

Wrapped by daemon:

```js
(async function (page) { const params = {"limit":"10"}; ... })
```

This is a valid **function expression**.

### Another Valid Form

Arrow functions are also valid:

```js
async (page) => {
  /* PARAMS_INJECT */
  // logic
}
```

Both forms pass validation, but function declaration style is more consistent with this document's example style.

### Types and Default Values

- **All parameter values are strings**. Even if manifest declares `"default": 3`, what is injected is `"3"`.
- If parameter is a number, you need to convert yourself: `parseInt(params.limit, 10)` or `parseFloat(params.ratio)`.
- If parameter is boolean, need to judge yourself: `params.someFlag === "true"`.
- **Parameters with declared `default`**: runner will automatically fill default values for missing parameters, do not write fallback in code (e.g., `params.limit || 3`), avoiding `--limit 0` being misjudged as falsy and overridden.
- **Parameters without declared `default`**: Code handles missing logic itself, not constrained by this rule.

---

## 3. Return Value

Command result is returned via `return`. Runner captures JSON after `### Result\n` from stdout and parses it before returning to the caller.

```js
return { articles: [{ title: "...", url: "..." }] };
```

- Returned object must be **serializable pure data**.
- **Do not** return functions, circular references, `undefined` values, or class instances.
- If returning an array is needed, recommend wrapping in object: `return { items: [...] }`.

---

## 4. Error Handling

### Basic Method

For business errors, directly throw `Error`:

```js
throw new Error("Something went wrong");
```

### Error Code Passing (Key)

`playwright-cli` execution environment **does not preserve** `Error.code` property. Runner can only identify business error codes through **keywords in error message text**.

Therefore, if you want runner to return a specific business error code, **it must be included in the message text**.

Recommended format:

```js
throw new Error("[AUTH_REQUIRED] Login required");
```

> `playwright-cli` execution environment does not preserve `Error.code` property, even if you set `error.code` in code, runner cannot read it. Ensure error code appears in message text.

If message does not contain known business error code keywords, runner will categorize the error as `COMMAND_EXECUTION_ERROR`. Complete semantic definition of business error codes see Section 6 of [`./contract.md`](./contract.md).

---

## 5. Environment Limitations

`playwright-cli` executes your code in an **isolated context**:

- **Unavailable**: `process`, `require`, `fs`, `path`, `console.log` (may have no output or be invisible) and other Node.js global variables.
- **Available**: Standard JavaScript built-in objects (`JSON`, `Math`, `Date`, `RegExp`, etc.) and Playwright API (through `page` parameter).
- **Do not** attempt to read/write local file system.

`run-code` executes in an isolated VM, `console.log` will not appear in stdout. The only outlet for debug info is `return`. If you need to observe intermediate state, return debug data together:

```js
return { debug: { url: page.url(), title: await page.title() }, items: [] };
```

### Pre-runtime Dependencies

- `playwright-cli` commands need a browser environment (CDP connection). If user has not enabled remote debugging, `command-runner.ts` returns `PLAYWRIGHT_CLI_ATTACH_REQUIRED` structured error.
- After user completes setup, call the command again to continue testing, no need to recreate the command.

### PowerShell Manual Testing Trap

If you directly manually call `playwright-cli run-code "<code>"` in PowerShell to test commands, spaces, curly braces, semicolons in the code string may be split by PowerShell into multiple tokens, causing `SyntaxError` or `too many arguments`. This is a **shell argument passing issue, not a command itself issue**.

websculpt runner uses `execFile` array parameter passing, unaffected by shell splitting. Therefore:

- When manually testing, prioritize using `eval` to verify if selectors work
- Leave complete runner chain testing to websculpt itself
- Do not modify command code because of PowerShell manual testing failure

---

## 6. Minimum Working Template

When precipitating `playwright-cli` commands, you can directly reuse the following structure:

```js
// command.js
async function (page) {
  /* PARAMS_INJECT */
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
}
```

```json
// manifest.json
{
  "runtime": "playwright-cli",
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
async function (page) {
  /* PARAMS_INJECT */
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
}
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

When manually拼接 URLs, parameter values should be encoded using `encodeURIComponent`. Even common language names have no special characters, characters like C++'s `++` must be encoded, otherwise URL parsing will error.

### Selector Stability

Prioritize using framework-level component classes (such as GitHub Primer's `Box-row`) or semantic attributes (`data-testid`, aria-label), avoid using dynamically generated class names. Record fallback positioning strategies to `context.md`, facilitating repair after failure.

### Control Probe Rhythm

High-frequency DOM operations or rapid page turning easily trigger risk control. During exploration, test "at what rhythm the site will refuse to respond", and use this rhythm as the default parameter for the precipitated command. `waitForSelector`'s polling wait is more anti-crawling friendly than fixed `sleep`, but batch calls still need to pay attention to request intervals.

### Tab Isolation

`playwright-cli` daemon shares the same injected `page` object across all concurrent executions. Directly operating on the shared `page` will cause navigation races, DOM pollution, and cross-command data crosstalk.

**All `playwright-cli` commands must** create an isolated page at the function start, and close it in `finally`:

```js
async function (page) {
  /* PARAMS_INJECT */
  page = await page.context().newPage();
  try {
    // ... command logic ...
  } finally {
    await page.close();
  }
}
```

- Reduce risk of accidentally operating on the original shared page in subsequent edits by **reassigning `page`** (rather than introducing new variables like `isolatedPage`).
- `finally` block is mandatory; omitting `page.close()` will cause orphan tabs to accumulate in the daemon, causing memory leaks and polluting `tab-list`.
- Do not close the original injected `page`, otherwise it will break the daemon's current tab state.

---

## 9. Runtime-specific Checklist

General checklist items see Section 5 of [`./contract.md`](./contract.md).

- [ ] Function signature is `async function (page)`, and contains `/* PARAMS_INJECT */`
- [ ] `/* PARAMS_INJECT */` is inside function body, not outside function body
- [ ] Boolean parameters judged via `=== "true"`
- [ ] No use of `process`, `require`, file I/O, and other Node.js APIs

---

## 10. Runner Error Code Reference

The following error codes are automatically generated by the runner, **do not need** to be thrown in `command.js`:

| Error Code | Meaning |
|--------|------|
| `MISSING_PARAMS_INJECT` | Command file missing `/* PARAMS_INJECT */` placeholder |
| `MISSING_RESULT_MARKER` | Command output missing `### Result` marker |
| `MALFORMED_RESULT_JSON` | Content after `### Result` is not valid JSON |
| `RUNTIME_NOT_FOUND` | `playwright-cli` not installed |
| `PLAYWRIGHT_CLI_ATTACH_REQUIRED` | Browser CDP session not attached. Confirm remote debugging is enabled; if confirmed enabled but still errors, may be background process residue, try `playwright-cli kill-all` and `playwright-cli close-all` then re-attach |
