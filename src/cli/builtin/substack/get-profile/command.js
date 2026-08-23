const SECTIONS = ['profile', 'activity', 'posts', 'likes-replies', 'subscriptions'];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizePublication(pub) {
  if (!pub) return null;
  return {
    id: pub.id,
    name: pub.name,
    subdomain: pub.subdomain,
    custom_domain: pub.custom_domain || null,
    logo_url: pub.logo_url || null,
  };
}

function normalizeProfile(user) {
  const publications = (user.publicationUsers || []).map((pu) => {
    const pub = normalizePublication(pu.publication);
    if (pub) {
      pub.role = pu.role || null;
      pub.is_primary = !!pu.is_primary;
      pub.hero_text = pu.publication?.hero_text || null;
    }
    return pub;
  }).filter(Boolean);

  const primary = normalizePublication(user.primaryPublication);

  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    previous_name: user.previous_name || null,
    avatar_url: user.photo_url || null,
    bio: user.bio || user.jobTitle || user.description || null,
    profile_url: `https://substack.com/@${user.handle}`,
    profile_set_up_at: user.profile_set_up_at || null,
    subscriber_count_string: user.subscriberCountString || null,
    subscriber_count_number: user.subscriberCountNumber ?? null,
    follower_count: user.followerCount ?? null,
    primary_publication: primary,
    publications,
    social_links: (user.userLinks || []).map((link) => ({
      type: link.type || null,
      label: link.label || null,
      url: link.url || null,
      value: link.value || null,
    })),
    status: user.status
      ? {
          bestseller_tier: user.status.bestsellerTier ?? null,
          badge: user.status.badge || null,
        }
      : null,
    source: 'api',
  };
}

function normalizeFeedItem(item) {
  const base = {
    type: item.type,
    context_type: item.context?.type || null,
    created_at: item.context?.timestamp || null,
  };

  if (item.type === 'post' && item.post) {
    base.title = item.post.title || null;
    base.subtitle = item.post.subtitle || null;
    base.post_url = item.publication
      ? `https://${item.publication.subdomain}.substack.com/p/${item.post.slug}`
      : null;
  } else if (item.type === 'comment' && item.comment) {
    base.body = item.comment.body || null;
    base.post_url = item.post && item.publication
      ? `https://${item.publication.subdomain}.substack.com/p/${item.post.slug}`
      : null;
  }

  base.publication = normalizePublication(item.publication);
  return base;
}

function normalizeSubscription(sub) {
  const pub = normalizePublication(sub.publication);
  if (pub) {
    pub.url = pub.custom_domain
      ? `https://${pub.custom_domain}/`
      : `https://${pub.subdomain}.substack.com/`;
  }
  return pub;
}

async function collectFeed(page, userId, section, limit) {
  const targetType = section === 'posts'
    ? 'post'
    : section === 'likes-replies'
      ? 'comment'
      : null;

  const collected = [];
  let cursor = null;
  let nextCursor = null;

  do {
    const url = cursor
      ? `https://substack.com/api/v1/reader/feed/profile/${userId}?cursor=${encodeURIComponent(cursor)}`
      : `https://substack.com/api/v1/reader/feed/profile/${userId}`;

    const data = await page.evaluate(async (fetchUrl) => {
      const res = await fetch(fetchUrl);
      if (!res.ok) {
        const err = new Error(`[API_ERROR] feed request failed with ${res.status}`);
        err.code = 'API_ERROR';
        throw err;
      }
      return res.json();
    }, url);

    const items = data.items || [];
    nextCursor = data.nextCursor || null;

    for (const item of items) {
      if (targetType && item.type !== targetType) continue;
      collected.push(normalizeFeedItem(item));
      if (collected.length >= limit) break;
    }

    cursor = nextCursor;
  } while (cursor && collected.length < limit);

  return { items: collected.slice(0, limit), next_cursor: cursor || null };
}

export default async (page, params, cwd) => {
  const handle = (params.handle || '').trim();
  if (!handle) {
    const err = new Error('[MISSING_PARAM] handle is required');
    err.code = 'MISSING_PARAM';
    throw err;
  }

  const cleanedHandle = handle.startsWith('@') ? handle.slice(1) : handle;
  if (!cleanedHandle || /[\/\s]/.test(cleanedHandle)) {
    const err = new Error('[INVALID_PARAM] handle must be a valid Substack username');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const section = (params.section || 'profile').trim().toLowerCase();
  if (!SECTIONS.includes(section)) {
    const err = new Error(`[INVALID_PARAM] section must be one of: ${SECTIONS.join(', ')}`);
    err.code = 'INVALID_PARAM';
    throw err;
  }

  let limit = DEFAULT_LIMIT;
  if (params.limit !== undefined && params.limit !== '') {
    limit = parseInt(params.limit, 10);
    if (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT) {
      const err = new Error(`[INVALID_PARAM] limit must be an integer between 1 and ${MAX_LIMIT}`);
      err.code = 'INVALID_PARAM';
      throw err;
    }
  }

  await page.goto('https://substack.com/explore', { waitUntil: 'domcontentloaded' });

  const searchUrl = `https://substack.com/api/v1/profile/search?query=${encodeURIComponent(cleanedHandle)}&page=0`;
  const searchData = await page.evaluate(async (fetchUrl) => {
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      const err = new Error(`[API_ERROR] profile search failed with ${res.status}`);
      err.code = 'API_ERROR';
      throw err;
    }
    return res.json();
  }, searchUrl);

  const user = (searchData.results || []).find((r) => r.handle === cleanedHandle);
  if (!user) {
    const err = new Error('[NOT_FOUND] Substack user not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (section === 'profile') {
    return normalizeProfile(user);
  }

  const profileStub = {
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatar_url: user.photo_url || null,
    profile_url: `https://substack.com/@${user.handle}`,
  };

  if (section === 'subscriptions') {
    const subs = (user.subscriptions || [])
      .map(normalizeSubscription)
      .filter(Boolean)
      .slice(0, limit);
    return { profile: profileStub, subscriptions: subs, source: 'api' };
  }

  const { items, next_cursor } = await collectFeed(page, user.id, section, limit);
  return { profile: profileStub, items, next_cursor, source: 'api' };
};
