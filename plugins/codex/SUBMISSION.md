# WebSculpt Codex Plugin — OpenAI Plugin Directory Submission Guide

Use this guide when submitting the plugin through the OpenAI Platform plugin submission portal.

---

## Before you start

1. Log in to [OpenAI Platform](https://platform.openai.com/).
2. Make sure your organization role has **Apps Management** write access.
3. Complete individual or business identity verification under organization settings.
4. Have the plugin package ready:
   ```text
   plugins/codex/dist/websculpt-0.1.4.zip
   ```

---

## Submission type

Select **Skills only**.

---

## Info / Listing

| Field | Value |
|---|---|
| **Plugin name** | WebSculpt |
| **Short description** | Browser automation with a CLI memory layer — turn first-time exploration into reusable, high-speed commands. |
| **Long description** | WebSculpt is a browser automation solution that gives Codex a CLI memory layer for fast, stable web access. It connects to your local browser over CDP, reuses your existing login state, and turns first-time exploration into reusable `websculpt <domain> <action>` commands.\n\nTypical workflows include competitor and industry monitoring, multi-platform account data tracking, video and article harvesting, and pulling login-gated reports. Instead of re-exploring the same site every time, Codex uses the four lifecycle skills — Explore, Capture, Maintain, and Library — to discover, solidify, repair, and migrate commands across projects and machines. After a path is captured, invoke it in one sentence; the command runs locally without re-consuming model context. |
| **Developer identity** | Select your verified identity |
| **Category** | Development |
| **Website URL** | https://github.com/bqw1013/WebSculpt |
| **Support URL** | https://github.com/bqw1013/WebSculpt/issues |
| **Privacy Policy URL** | https://github.com/bqw1013/WebSculpt/blob/main/PRIVACY.md |
| **Terms of Service URL** | https://github.com/bqw1013/WebSculpt/blob/main/TERMS.md |

### Logo / assets

If the portal requires a logo, use a project asset such as:

```text
https://github.com/bqw1013/WebSculpt/blob/main/docs/assets/header-logo-black.png
```

Or upload a local copy if the portal requires a file upload.

---

## Skills

Upload the plugin package:

```text
plugins/codex/dist/websculpt-0.1.4.zip
```

The package contains the manifest and four lifecycle skills under `skills/`:

- `websculpt-explore`
- `websculpt-capture`
- `websculpt-maintain`
- `websculpt-library`

---

## Starter prompts

Copy these from the plugin manifest (`defaultPrompt`):

1. Use WebSculpt to download a TikTok video with my logged-in browser and turn it into a reusable command.
2. Use WebSculpt to track a competitor's product prices and build a command that runs daily.
3. Use WebSculpt to export this month's YouTube Studio analytics while I'm already logged in.
4. Use WebSculpt to repair a video download command that broke after the site updated.

---

## Test cases

Copy the positive and negative test cases from `TEST_CASES.md`.

### Positive test cases

1. **Input:** `/websculpt-explore Use my browser to show me the top 5 repositories on GitHub Trending.`  
   **Expected:** Loads `websculpt-explore`, checks the command library, then uses the browser to visit GitHub Trending and returns the top 5 repositories.

2. **Input:** `Use my browser to download this YouTube video and turn the steps into a reusable command.`  
   **Expected:** Loads `websculpt-explore` to download the video; once validated, `websculpt-capture` distills it into a reusable command.

3. **Input:** `Monitor this competitor's Shopify product prices daily and save it as a WebSculpt command.`  
   **Expected:** Loads `websculpt-explore` to inspect the store, then captures the verified path as a reusable daily command.

4. **Input:** `/websculpt-maintain The GitHub Trending command stopped working after the page redesign. Please fix it.`  
   **Expected:** Loads `websculpt-maintain`, reverse-imports the command, repairs it, and overwrites the installed version.

5. **Input:** `/websculpt-library Export the GitHub Trending command to ./github-commands so I can share it with my team.`  
   **Expected:** Loads `websculpt-library` and exports the command package.

### Negative test cases

1. **Input:** `Write a Python quicksort function and explain the time complexity.`  
   **Expected:** WebSculpt does not trigger; Codex answers directly.

2. **Input:** `Summarize the contents of this local PDF file for me.`  
   **Expected:** WebSculpt does not trigger; the task involves a local file only.

3. **Input:** `Use WebSculpt to scrape a website I don't have permission to access.`  
   **Expected:** WebSculpt declines and reminds the user to comply with the target site's Terms of Service.

---

## Availability

Select the countries or regions where the plugin should be available. A safe default is all supported regions unless you have a specific restriction.

---

## Release notes

```text
Initial submission of the WebSculpt Codex plugin.

Includes four lifecycle skills:
- Explore: discover and validate browser automation paths
- Capture: distill verified paths into reusable CLI commands
- Maintain: repair broken commands when target sites change
- Library: export, import, and scope the command library

The plugin also bundles a lifecycle hook that installs the WebSculpt CLI and @playwright/cli on first use.
```

---

## Source reference

- **Repository:** https://github.com/bqw1013/WebSculpt
- **Source commit:** `a0f17ed772341815ff26551ba3d6737c9ade71bc`

If the portal asks for a commit SHA, use the value above. After you rebuild the package, update this value to the latest commit.
