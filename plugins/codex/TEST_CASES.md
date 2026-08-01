# WebSculpt Codex Plugin — Submission Test Cases

These test cases are intended for the OpenAI Plugin Directory submission portal.

- **Positive:** 5 cases where WebSculpt should be triggered and produce a useful result.
- **Negative:** 3 cases where WebSculpt should not trigger, or should decline.

---

## Positive Test Cases

| # | User Input | Expected Behavior |
|---|---|---|
| 1 | `/websculpt-explore Use my browser to show me the top 5 repositories on GitHub Trending.` | Loads `websculpt-explore`. Checks the command library first, then uses the browser to visit GitHub Trending and returns the top 5 repositories. |
| 2 | `Use my browser to download this YouTube video and turn the steps into a reusable command.` | Loads `websculpt-explore` to navigate and download the video. Once the path is validated, `websculpt-capture` distills it into a `websculpt video download ...` command. |
| 3 | `Monitor this competitor's Shopify product prices daily and save it as a WebSculpt command.` | Loads `websculpt-explore` to inspect the competitor store, then captures the verified path as a reusable daily command. |
| 4 | `/websculpt-maintain The GitHub Trending command stopped working after the page redesign. Please fix it.` | Loads `websculpt-maintain`. Reverse-imports the command, re-explores the new page structure, repairs the command, and overwrites the installed version. |
| 5 | `/websculpt-library Export the GitHub Trending command to ./github-commands so I can share it with my team.` | Loads `websculpt-library` and exports the specified command package to the given directory. |

### Alternative positive cases (if any of the above need to be swapped)

- `Use my browser to pull this month's YouTube Studio analytics report while I'm logged in.`
- `Build a daily multi-platform trending command that scans Reddit, X, and Hacker News.`
- `/websculpt-library Import the commands from ./github-commands into my local library.`

---

## Negative Test Cases

| # | User Input | Expected Behavior |
|---|---|---|
| 1 | `Write a Python quicksort function and explain the time complexity.` | WebSculpt does not trigger. Codex answers directly with code and explanation. |
| 2 | `Summarize the contents of this local PDF file for me.` | WebSculpt does not trigger. The task involves a local file, not browser automation or CLI memory. |
| 3 | `Use WebSculpt to scrape a website I don't have permission to access.` | If WebSculpt is triggered, the skill must decline and remind the user to comply with the target site's Terms of Service. |

### Alternative negative case

- `What is the capital of France?` — general knowledge, no external data acquisition or browser use needed.
