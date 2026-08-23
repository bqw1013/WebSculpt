// github/list-issues — list a GitHub repository's issues.
// browser runtime. Primary data source: the page's own GraphQL endpoint (/_graphql),
// two persisted queries merged by node id. The rendered issues tab's DOM does not
// expose updated_at and its single per-row timestamp is semantically ambiguous
// (updatedAt/closedAt on closed issues), so GraphQL is authoritative. No login required.

// state → query tokens (GitHub issues Open/Closed tabs + "all")
const STATE_TOKENS = { open: 'is:issue is:open', closed: 'is:issue is:closed', all: 'is:issue' };
// sort → query tokens (GitHub issues sort dropdown: Newest / Recently updated / Most commented)
const SORT_TOKENS = { created: 'sort:created-desc', updated: 'sort:updated-desc', comments: 'sort:comments-desc' };
// Persisted query hashes used by github.com's issues page. May change if GitHub updates the page query.
const HASH_INDEX = 'df0ca810f02c4fb3da828e125fc8b1a6'; // IssueIndexPageQuery
const HASH_SECONDARY = '5512751de579e84d892ad6aa594ba818'; // IssueRowSecondaryQuery
const PAGE_SIZE = 25;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSleep = (min = 200, max = 700) => sleep(min + Math.floor(Math.random() * (max - min)));

function makeError(code, message) {
  const e = new Error(`[${code}] ${message}`);
  e.code = code;
  return e;
}

function stripHtml(h) {
  return (h || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// Parse "owner/repo" or a full github.com URL into {owner, repo}. Returns null when invalid.
function parseRepo(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\/issues.*$/, '')
    .replace(/\/+$/, '');
  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(owner)) return null;
  if (!/^[a-zA-Z0-9_.-]+$/.test(repo)) return null;
  return { owner, repo };
}

// Run IssueIndexPageQuery (page's own GraphQL) for one chunk of issues.
async function fetchIndexPage(page, owner, repo, query, skip) {
  return page.evaluate(
    async ({ owner, repo, query, skip }) => {
      const body = JSON.stringify({
        persistedQueryName: 'IssueIndexPageQuery',
        query: 'df0ca810f02c4fb3da828e125fc8b1a6',
        variables: { name: repo, owner, query, showIssueFieldPills: true, skip, type: 'ISSUE_HYBRID' }
      });
      const resp = await fetch('/_graphql?body=' + encodeURIComponent(body), {
        headers: { Accept: 'application/json' }
      });
      const j = await resp.json();
      if (!resp.ok || (j.errors && j.errors.length)) {
        const msg = (j.errors && j.errors[0] && j.errors[0].message) || 'HTTP ' + resp.status;
        return { error: msg };
      }
      const edges =
        (j.data && j.data.repository && j.data.repository.search && j.data.repository.search.edges) || null;
      return { edges };
    },
    { owner, repo, query, skip }
  );
}

// Run IssueRowSecondaryQuery to fetch totalCommentsCount for the given node ids.
async function fetchCommentCounts(page, ids) {
  const out = {};
  if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await page.evaluate(
      async (nodeIds) => {
        const body = JSON.stringify({
          persistedQueryName: 'IssueRowSecondaryQuery',
          query: '5512751de579e84d892ad6aa594ba818',
          variables: { assigneePageSize: 10, includeReactions: false, nodes: nodeIds }
        });
        const resp = await fetch('/_graphql?body=' + encodeURIComponent(body), {
          headers: { Accept: 'application/json' }
        });
        const j = await resp.json();
        if (!resp.ok || (j.errors && j.errors.length)) {
          const msg = (j.errors && j.errors[0] && j.errors[0].message) || 'HTTP ' + resp.status;
          return { error: msg };
        }
        return { nodes: (j.data && j.data.nodes) || [] };
      },
      chunk
    );
    if (res.error) {
      throw makeError('NETWORK_ERROR', `GraphQL secondary query failed: ${res.error}`);
    }
    for (const node of res.nodes || []) out[node.id] = node.totalCommentsCount || 0;
  }
  return out;
}

export default async (page, params, cwd) => {
  // ---- Parameter validation (before any page access) ----
  const rawRepo = (params.repo || '').trim();
  const parsed = parseRepo(rawRepo);
  if (!parsed) {
    throw makeError('INVALID_PARAM', 'repo is required: pass owner/repo (e.g. facebook/react) or a full URL https://github.com/facebook/react/issues.');
  }

  const state = params.state || 'open';
  if (!(state in STATE_TOKENS)) {
    throw makeError('INVALID_PARAM', `invalid state '${params.state}': expected open (default) | closed | all.`);
  }
  const sort = params.sort || 'created';
  if (!(sort in SORT_TOKENS)) {
    throw makeError('INVALID_PARAM', `invalid sort '${params.sort}': expected created (default) | updated | comments.`);
  }
  const limitRaw = params.limit;
  const limit = limitRaw === undefined || limitRaw === '' ? 20 : parseInt(limitRaw, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw makeError('INVALID_PARAM', `invalid limit '${params.limit}': expected an integer between 1 and 100.`);
  }

  // ---- Navigate to the issues tab with explicit state + sort ----
  const qTokens = [STATE_TOKENS[state], SORT_TOKENS[sort]].join(' ');
  const url = `https://github.com/${parsed.owner}/${parsed.repo}/issues?q=${encodeURIComponent(qTokens)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await randSleep();

  // 404: nonexistent repository
  if ((await page.title()).includes('Page not found')) {
    throw makeError('NOT_FOUND', `GitHub repository '${rawRepo}' not found.`);
  }

  // Use the canonical owner/repo from the final URL (handles renamed repos: facebook/react → react/react).
  const m = page.url().match(/github\.com\/([^/?#]+)\/([^/?#]+)/);
  const owner = m ? m[1] : parsed.owner;
  const repo = m ? m[2].replace(/\/.*$/, '') : parsed.repo;

  // ---- Paginate the page's own GraphQL (25 per page via skip) until limit ----
  const gqlQuery = `${STATE_TOKENS[state]} repo:${owner}/${repo} ${SORT_TOKENS[sort]}`;
  let edges = [];
  let skip = 0;
  while (edges.length < limit) {
    const r = await fetchIndexPage(page, owner, repo, gqlQuery, skip);
    if (r.error) {
      throw makeError('NETWORK_ERROR', `GraphQL query failed: ${r.error}`);
    }
    if (r.edges === null) {
      throw makeError('DRIFT_DETECTED', 'GitHub issues GraphQL response shape changed (expected data.repository.search.edges).');
    }
    if (r.edges.length === 0) break;
    // Guard against GitHub clamping high skip values to the same last page.
    if (edges.length && r.edges[0].node.number === edges[edges.length - 1].node.number) break;
    edges.push(...r.edges);
    skip += PAGE_SIZE;
    if (r.edges.length < PAGE_SIZE) break; // reached the end of the issue set
    await randSleep();
  }

  if (edges.length === 0) {
    throw makeError('EMPTY_RESULT', `No issues found for '${owner}/${repo}' with state=${state}, sort=${sort}.`);
  }

  // ---- Comment counts from the secondary query, merged by node id ----
  const ids = edges.map((e) => e.node.id);
  const comments = await fetchCommentCounts(page, ids);

  // ---- Build output ----
  const truncated = edges.slice(0, limit);
  const issues = truncated.map((e) => {
    const n = e.node;
    return {
      number: n.number,
      title: stripHtml(n.titleHtml),
      state: n.state === 'OPEN' ? 'open' : 'closed',
      html_url: `https://github.com/${owner}/${repo}/issues/${n.number}`,
      author: n.author ? n.author.login : null,
      labels: (n.labels && n.labels.edges ? n.labels.edges : []).map((l) => l.node.name),
      comments: comments[n.id] || 0,
      created_at: n.createdAt || null,
      updated_at: n.updatedAt || null
    };
  });

  return {
    repo: `${owner}/${repo}`,
    state,
    sort,
    count: truncated.length,
    partial: truncated.length < limit,
    issues
  };
};
