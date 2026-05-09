# arxiv/search-papers

Search arxiv.org for academic papers and return structured metadata.

## Description

This command queries the public arxiv API to find papers matching a given search query. It returns a list of papers with titles, abstracts, authors, categories, and direct links to the PDF and HTML abstract pages.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `query` | Yes | — | Search query using arxiv syntax. Examples: `all:agentic AND all:reinforcement`, `ti:transformer`, `au:smith` |
| `limit` | No | `10` | Maximum number of results to return (1–50) |
| `sortBy` | No | `submittedDate` | Sort field: `submittedDate`, `relevance`, or `lastUpdatedDate` |
| `sortOrder` | No | `descending` | Sort direction: `ascending` or `descending` |

## Return Value

Array of paper objects:

```json
[
  {
    "id": "2605.06642",
    "title": "StraTA: Incentivizing Agentic Reinforcement Learning...",
    "summary": "Large language models are increasingly used...",
    "authors": ["Xiangyuan Xue", "Yifan Zhou"],
    "published": "2026-05-07T17:51:16Z",
    "updated": "2026-05-07T17:51:16Z",
    "primaryCategory": "cs.CL",
    "categories": ["cs.CL", "cs.AI"],
    "comment": "26 pages, 4 figures, 7 tables",
    "htmlUrl": "https://arxiv.org/abs/2605.06642",
    "pdfUrl": "https://arxiv.org/pdf/2605.06642"
  }
]
```

## Usage

```bash
# Search for agentic RL papers, newest first
websculpt arxiv search-papers --query "all:agentic AND all:reinforcement AND all:learning"

# Get top 5 most relevant papers about transformers
websculpt arxiv search-papers --query "ti:transformer" --limit 5 --sortBy relevance

# Search by author
websculpt arxiv search-papers --query "au:smith" --sortBy lastUpdatedDate
```

## Common Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_PARAM` | The `query` parameter is required but was not provided. |
| `EMPTY_RESULT` | No papers matched the given query. |
| `API_ERROR` | The arxiv API returned a non-200 status code. |
