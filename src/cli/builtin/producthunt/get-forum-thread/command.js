const fail = (code, message) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
};

const integerParam = (value, name, min, max) => {
  if (value === undefined || value === null || !/^[1-9][0-9]*$/.test(String(value))) {
    fail("INVALID_PARAM", `${name} must be an integer from ${min} to ${max}`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    fail("INVALID_PARAM", `${name} must be an integer from ${min} to ${max}`);
  }
  return number;
};

const slugParam = (value, name) => {
  if (value === undefined || value === null) fail("MISSING_PARAM", `${name} is required`);
  if (typeof value !== "string" || value.trim() === "") {
    fail("INVALID_PARAM", `${name} must be a non-empty URL slug`);
  }
  const slug = value.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    fail("INVALID_PARAM", `${name} must contain only letters, numbers, and hyphens`);
  }
  return slug;
};

const boolParam = (value, name) => {
  const text = String(value);
  if (text !== "true" && text !== "false") fail("INVALID_PARAM", `${name} must be true or false`);
  return text === "true";
};

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

export default async (page, params, cwd) => {
  const forum = slugParam(params.forum, "forum");
  const thread = slugParam(params.thread, "thread");
  const pageNumber = integerParam(params.page, "page", 1, 50);
  const limit = integerParam(params.limit, "limit", 1, 50);
  const detailed = boolParam(params.detailed, "detailed");
  const canonicalUrl = `https://www.producthunt.com/p/${forum}/${thread}`;
  const targetUrl = pageNumber === 1 ? canonicalUrl : `${canonicalUrl}?page=${pageNumber}#comments`;

  let response;
  try {
    response = await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(randomInt(180, 440));
    await page.mouse.move(280 + randomInt(0, 80), 180 + randomInt(0, 60), { steps: 2 });
    await page.waitForSelector("main", { state: "visible", timeout: 30000 });
  } catch (error) {
    const text = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (response?.status() === 404 || /404|page not found|doesn.?t exist/i.test(text)) {
      fail("NOT_FOUND", `Thread not found: ${forum}/${thread}`);
    }
    if (/timeout/i.test(String(error))) {
      fail("DRIFT_DETECTED", "Product Hunt thread page did not expose its main content before timeout");
    }
    throw error;
  }

  const extracted = await page.evaluate(({ forumSlug, threadSlug, requestedPage, detailedMarker }) => {
    const tidy = (value) => (value || "").replace(/\s+/g, " ").trim();
    const cache = window.apolloClient?.cache?.extract?.() || {};
    const resolve = (value) => value && value.__ref ? cache[value.__ref] || null : value || null;
    const threadEntry = Object.entries(cache).find(([key, value]) =>
      /^DiscussionThread/.test(key) && value?.slug === threadSlug
    );
    const threadEntity = threadEntry ? threadEntry[1] : null;
    const route = `/p/${forumSlug}/${threadSlug}`;
    const association = Object.values(cache).find((value) =>
      value?.__typename === "DiscussionForumAssociationType" && value.path === route
    ) || null;
    const main = document.querySelector("main");
    const bodyText = document.body?.innerText || "";
    const htmlDocument = (html) => {
      const node = document.createElement("div");
      node.innerHTML = html || "";
      return node;
    };
    const htmlText = (html) => tidy(htmlDocument(html).innerText || htmlDocument(html).textContent);
    const bodyBlocks = (html) => Array.from(htmlDocument(html).querySelectorAll("p,li"))
      .map((node) => ({
        type: node.tagName.toLowerCase() === "li" ? "list-item" : "paragraph",
        text: tidy(node.textContent),
      }))
      .filter((block) => block.text);
    const linksFromHtml = (html) => Array.from(htmlDocument(html).querySelectorAll("a[href]"))
      .map((node) => ({ name: tidy(node.textContent), url: node.href }))
      .filter((link) => link.url);
    const author = (entity) => {
      const user = resolve(entity?.user);
      return user ? {
        id: user.id || null,
        name: user.name || null,
        username: user.username || null,
        avatarUrl: user.avatarUrl || null,
        url: user.username ? `/@${user.username}` : null,
      } : null;
    };
    const connection = (entity, prefix, requested) => {
      const matches = Object.entries(entity || {}).filter(([key, value]) =>
        key.startsWith(prefix) && value?.value?.__typename === "CommentConnection"
      );
      return matches.find(([, value]) => value.args?.page === requested)?.[1] || matches[0]?.[1] || null;
    };
    const mapComment = (reference, depth) => {
      const comment = resolve(reference);
      if (!comment) return null;
      const item = {
        id: comment.id || null,
        author: author(comment),
        text: htmlText(comment.bodyHtml || comment.body),
        createdAt: comment.createdAt || null,
        upvotes: comment.votesCount ?? null,
        parent: resolve(comment.parent)?.id || null,
        repliesCount: comment.repliesCount ?? 0,
        visibleRepliesCount: comment.visibleRepliesCount ?? 0,
      };
      if (depth < 1) {
        const repliesConnection = connection(comment, "replies:", null);
        const replyEdges = repliesConnection?.value?.edges || [];
        item.replies = replyEdges.map((edge) => mapComment(edge.node, depth + 1)).filter(Boolean);
        item.replyPagination = repliesConnection?.value?.pageInfo || null;
      }
      if (detailedMarker) {
        item.bodyHtml = comment.bodyHtml || comment.body || null;
        item.path = comment.path || null;
        item.url = comment.url || null;
        item.isSticky = comment.isSticky === true;
      }
      return item;
    };
    const commentConnection = connection(threadEntity, "threads:", requestedPage);
    const edges = commentConnection?.value?.edges || [];
    const forumEntity = resolve(threadEntity?.primaryForum);
    const subject = resolve(forumEntity?.subject);
    const associationAuthor = author(association);
    const title = association?.title || null;
    const associationBody = association?.description || "";
    const pageLinks = main ? Array.from(main.querySelectorAll("a[href]"))
      .filter((node) => /#comments$/.test(node.getAttribute("href") || ""))
      .map((node) => {
        const url = new URL(node.getAttribute("href"), location.href);
        return { label: tidy(node.textContent), page: Number(url.searchParams.get("page") || "1"), url: url.toString() };
      }) : [];
    return {
      hasMain: Boolean(main),
      hasRepliesHeading: /(?:^|\n)Replies(?:\n|$)/i.test(bodyText),
      notFound: /404|page not found|doesn.?t exist/i.test(bodyText),
      apolloAvailable: Boolean(threadEntity && association),
      thread: threadEntity ? {
        id: threadEntity.id || null,
        slug: threadEntity.slug || threadSlug,
        title,
        author: associationAuthor,
        createdAt: association?.createdAt || null,
        body: htmlText(associationBody),
        bodyHtml: associationBody || null,
        bodyBlocks: bodyBlocks(associationBody),
        products: linksFromHtml(associationBody).filter((link) => /\/products\//.test(link.url)),
        url: association?.path ? `https://www.producthunt.com${association.path}` : route,
        views: association?.pageViewsCount ?? null,
        status: threadEntity.status || null,
        engagement: {
          comments: threadEntity.commentsCount ?? association?.commentsCount ?? null,
          upvotes: threadEntity.votesCount ?? null,
        },
      } : null,
      forum: {
        slug: forumSlug,
        label: subject?.name || subject?.title || forumEntity?.slug || forumSlug,
        type: /^DiscussionCategory/.test(subject?.__typename || "") ? "topic" : "product",
      },
      replies: edges.map((edge) => mapComment(edge.node, 0)).filter(Boolean),
      pagination: {
        page: commentConnection?.args?.page ?? requestedPage,
        pageSize: commentConnection?.args?.first ?? null,
        totalCount: commentConnection?.value?.totalCount ?? null,
        endCursor: commentConnection?.value?.pageInfo?.endCursor || null,
        hasNextPage: commentConnection?.value?.pageInfo?.hasNextPage === true,
        hasPreviousPage: commentConnection?.value?.pageInfo?.hasPreviousPage === true,
        order: commentConnection?.args?.order || null,
        links: pageLinks,
      },
    };
  }, { forumSlug: forum, threadSlug: thread, requestedPage: pageNumber, detailedMarker: detailed });

  if (response?.status() === 404 || extracted.notFound) fail("NOT_FOUND", `Thread not found: ${forum}/${thread}`);
  if (!extracted.hasMain || !extracted.hasRepliesHeading || !extracted.apolloAvailable || !extracted.thread) {
    fail("DRIFT_DETECTED", "Product Hunt thread structure or Apollo detail data was not found");
  }
  if (pageNumber > 1 && extracted.replies.length === 0) {
    fail("EMPTY_RESULT", `No replies found on page ${pageNumber}`);
  }

  const replies = extracted.replies.slice(0, limit);
  const result = {
    sourceUrl: await page.evaluate(() => location.href),
    forum: extracted.forum,
    thread: {
      id: extracted.thread.id,
      slug: extracted.thread.slug,
      url: extracted.thread.url,
      title: extracted.thread.title,
      author: detailed ? extracted.thread.author : {
        name: extracted.thread.author?.name || null,
        username: extracted.thread.author?.username || null,
      },
      createdAt: extracted.thread.createdAt,
      body: extracted.thread.body,
      views: extracted.thread.views,
      status: extracted.thread.status,
      engagement: extracted.thread.engagement,
    },
    replies: detailed ? replies : replies.map((reply) => ({
      id: reply.id,
      author: { name: reply.author?.name || null, username: reply.author?.username || null },
      text: reply.text,
      createdAt: reply.createdAt,
      upvotes: reply.upvotes,
      repliesCount: reply.repliesCount,
    })),
    pagination: {
      page: extracted.pagination.page,
      pageSize: extracted.pagination.pageSize,
      returned: replies.length,
      totalCount: extracted.pagination.totalCount,
      endCursor: extracted.pagination.endCursor,
      hasNextPage: extracted.pagination.hasNextPage,
      hasPreviousPage: extracted.pagination.hasPreviousPage,
      order: extracted.pagination.order,
    },
  };
  if (detailed) {
    result.thread.bodyHtml = extracted.thread.bodyHtml;
    result.thread.bodyBlocks = extracted.thread.bodyBlocks;
    result.thread.products = extracted.thread.products;
    result.pagination.links = extracted.pagination.links;
  }
  await page.waitForTimeout(randomInt(0, 2000));
  return result;
};
