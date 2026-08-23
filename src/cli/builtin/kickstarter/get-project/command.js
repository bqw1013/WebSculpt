// kickstarter/get-project — browser runtime
// First-hand verified paths (2026-08-20):
//   - window.current_project is nested: window.current_project.data holds all project fields
//   - story/risks are NOT in current_project; fetched via POST /graph Campaign query
//   - comments via CommentsQuery (commentableId = base64("Project-" + pid))
//   - updates via PostsFeed (project(slug).timeline)
//   - stats via /projects/{creator}/{slug}/stats.json?v=1
//   - node/curl are blocked by Cloudflare managed challenge; browser is the only runtime.

const CAMPAIGN_QUERY = `query Campaign($slug: String!) {
  project(slug: $slug) {
    id
    risks
    story(assetWidth: 680)
    storyRteVersion
    currency
  }
}`;

const COMMENTS_QUERY = `query CommentsQuery($commentableId: ID!, $nextCursor: String, $previousCursor: String, $first: Int, $last: Int) {
  commentable: node(id: $commentableId) {
    id
    ... on Project {
      url
      __typename
    }
    ... on Commentable {
      canComment
      canCommentSansRestrictions
      commentsCount
      projectRelayId
      canUserRequestUpdate
      comments(first: $first, last: $last, after: $nextCursor, before: $previousCursor) {
        edges {
          node {
            id
            body
            createdAt
            parentId
            author {
              name
              url
            }
            replies(last: 3) {
              totalCount
              nodes {
                id
                body
                author {
                  name
                }
              }
            }
          }
        }
        pageInfo {
          startCursor
          hasNextPage
          hasPreviousPage
          endCursor
        }
      }
    }
  }
}`;

const POSTS_QUERY = `query PostsFeed($projectSlug: String!, $cursor: String, $first: Int) {
  project(slug: $projectSlug) {
    id
    slug
    timeline(first: $first, after: $cursor) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          type
          timestamp
          data {
            ... on Postable {
              id
              type
              title
              publishedAt
              number
              isPublic
              likesCount
            }
            ... on FreeformPost {
              commentsCount(withReplies: true)
              body
            }
          }
        }
      }
    }
  }
}`;

function businessError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function parseLimit(value, name) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) {
    throw businessError("INVALID_PARAM", `${name} must be a positive integer`);
  }
  return n;
}

function parseProjectUrl(raw) {
  let creator = null;
  let slug = null;
  let fullUrl = null;
  if (/^https?:\/\//i.test(raw)) {
    fullUrl = raw;
    const m = raw.match(/kickstarter\.com\/projects\/([^/?#]+)\/([^/?#]+)/i);
    if (m) {
      creator = m[1];
      slug = m[2];
    }
  } else {
    const parts = raw.split("/").filter(Boolean);
    if (parts.length === 2) {
      creator = parts[0];
      slug = parts[1];
      fullUrl = `https://www.kickstarter.com/projects/${creator}/${slug}`;
    }
  }
  if (!slug || !fullUrl) {
    throw businessError("INVALID_PARAM", `Cannot parse project URL/slug: "${raw}". Use a project URL or creator/slug.`);
  }
  return { creator, slug, fullUrl };
}

async function graphFetch(page, token, body) {
  const res = await page.evaluate(async ({ token, body }) => {
    const resp = await fetch("/graph", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify([body]),
    });
    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { ok: false, kind: "non-json", raw: text.slice(0, 400), status: resp.status };
    }
    const first = Array.isArray(json) ? json[0] : json;
    if (first && first.errors) {
      return { ok: false, kind: "graph-errors", errors: first.errors.map((x) => x.message).slice(0, 5), status: resp.status };
    }
    return { ok: true, data: first ? first.data : null, status: resp.status };
  }, { token, body });
  if (res.kind === "non-json") {
    throw businessError("PLATFORM_BLOCKED", `Graph endpoint returned non-JSON (status ${res.status})`);
  }
  if (res.kind === "graph-errors") {
    throw businessError("DRIFT_DETECTED", `Graph query failed: ${res.errors.join("; ")}`);
  }
  return res;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async (page, params, cwd) => {
  const url = (params.url || "").trim();
  if (!url) {
    throw businessError("MISSING_PARAM", "Missing required parameter: url");
  }
  const { creator, slug, fullUrl } = parseProjectUrl(url);

  await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

  const state = await page.evaluate(() => {
    const cp = window.current_project;
    const meta = document.querySelector('meta[name="csrf-token"]');
    return {
      hasProject: !!(cp && cp.data && cp.data.id),
      title: document.title,
      bodyText: (document.body && document.body.innerText || "").slice(0, 600),
      csrfToken: meta ? meta.getAttribute("content") : null,
    };
  });

  if (/just a moment|cf-chl|challenges\.cloudflare|security verification/i.test(state.bodyText + " " + state.title)) {
    throw businessError("PLATFORM_BLOCKED", "Cloudflare challenge detected");
  }
  if (!state.hasProject) {
    if (/404|doesn't exist|not found/i.test(state.title)) {
      throw businessError("NOT_FOUND", `Project not found: ${fullUrl}`);
    }
    throw businessError("DRIFT_DETECTED", "window.current_project.data not found on project page");
  }
  if (!state.csrfToken) {
    throw businessError("DRIFT_DETECTED", "csrf-token meta tag not found");
  }

  const project = await page.evaluate(() => {
    const d = window.current_project.data;
    const cat = d.category || {};
    const cr = d.creator || {};
    const loc = d.location || {};
    const photo = d.photo || {};
    const video = d.video || {};
    const mapReward = (r) => ({
      id: r.id,
      minimum: r.minimum,
      backers_count: r.backers_count,
      title: r.title,
      description: r.description,
      is_limited: r.is_limited,
      remaining: r.remaining,
      estimated_delivery_on: r.estimated_delivery_on,
      reward_type: r.reward_type,
      shipping_preference: r.shipping_preference,
    });
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      url: (d.urls && d.urls.web && d.urls.web.project) || null,
      blurb: d.blurb,
      state: d.state,
      goal: d.goal,
      pledged: d.pledged,
      currency: d.currency,
      usd_pledged: d.usd_pledged,
      percent_funded: d.goal ? Math.round((Number(d.pledged) / Number(d.goal)) * 100) : null,
      backers_count: d.backers_count,
      launched_at: d.launched_at,
      deadline: d.deadline,
      created_at: d.created_at,
      state_changed_at: d.state_changed_at,
      updated_at: d.updated_at,
      creator: { id: cr.id, name: cr.name, slug: cr.slug, avatar: cr.avatar || null, urls: cr.urls || null },
      location: { id: loc.id, name: loc.name, displayable_name: loc.displayable_name, country: loc.country, state: loc.state, type: loc.type },
      category: { id: cat.id, name: cat.analytics_name || cat.name, localized_name: cat.name, slug: cat.slug, parent_id: cat.parent_id, parent_name: cat.parent_name },
      tags: Array.isArray(d.tags) ? d.tags : [],
      photo: { full: photo.full, med: photo.med, thumb: photo.thumb },
      video: { hls: video.hls, high: video.high, base: video.base, frame: video.frame },
      rewards: Array.isArray(d.rewards) ? d.rewards.map(mapReward) : [],
      add_ons: Array.isArray(d.add_ons) ? d.add_ons.map(mapReward) : [],
      comments_count: d.comments_count,
      updates_count: d.updates_count,
    };
  });

  // gentle random scroll to keep a polite pacing profile
  await page.evaluate(() => { window.scrollBy(0, Math.floor(Math.random() * 300) + 200); });
  await sleep(200 + Math.floor(Math.random() * 300));

  const graphSlug = `${creator}/${slug}`;

  const campaign = await graphFetch(page, state.csrfToken, {
    operationName: "Campaign",
    variables: { slug: graphSlug },
    query: CAMPAIGN_QUERY,
  });
  if (campaign.data && campaign.data.project) {
    project.story = campaign.data.project.story || null;
    project.risks = campaign.data.project.risks || null;
  }

  const stats = await page.evaluate(async (relPath) => {
    try {
      const resp = await fetch(relPath, { credentials: "same-origin" });
      if (!resp.ok) return null;
      const text = await resp.text();
      const json = JSON.parse(text);
      return json.project || null;
    } catch (e) {
      return null;
    }
  }, `/projects/${creator}/${slug}/stats.json?v=1`);
  if (stats) {
    project.stats = stats;
  }

  const result = { project };

  if (params.include_comments === "true") {
    const commentLimit = parseLimit(params.comment_limit, "comment_limit");
    const relayId = Buffer.from(`Project-${project.id}`).toString("base64");
    const comments = await graphFetch(page, state.csrfToken, {
      operationName: "CommentsQuery",
      variables: { commentableId: relayId, nextCursor: null, previousCursor: null, first: commentLimit, last: null },
      query: COMMENTS_QUERY,
    });
    const commentable = comments.data && comments.data.commentable;
    const conn = commentable && commentable.comments;
    result.comments = {
      commentsCount: commentable ? commentable.commentsCount : 0,
      items: conn ? conn.edges.map((e) => e.node) : [],
      hasNextPage: conn ? conn.pageInfo.hasNextPage : false,
      endCursor: conn ? conn.pageInfo.endCursor : null,
    };
  }

  if (params.include_updates === "true") {
    const updateLimit = parseLimit(params.update_limit, "update_limit");
    const posts = await graphFetch(page, state.csrfToken, {
      operationName: "PostsFeed",
      variables: { projectSlug: slug, cursor: null, first: updateLimit },
      query: POSTS_QUERY,
    });
    const timeline = posts.data && posts.data.project && posts.data.project.timeline;
    result.updates = {
      totalCount: timeline ? timeline.totalCount : 0,
      items: timeline ? timeline.edges.map((e) => ({ type: e.node.type, timestamp: e.node.timestamp, data: e.node.data })) : [],
      hasNextPage: timeline ? timeline.pageInfo.hasNextPage : false,
      endCursor: timeline ? timeline.pageInfo.endCursor : null,
    };
  }

  return result;
};
