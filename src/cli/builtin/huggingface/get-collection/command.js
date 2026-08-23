// huggingface/get-collection: fetch a HF collection's detail via its internal API.
const HF_ORIGIN = "https://huggingface.co";

function businessError(code, message) {
  const err = new Error("[" + code + "] " + message);
  err.code = code;
  return err;
}

// Accepts "user/slug" or a full URL https://huggingface.co/collections/{user}/{slug}.
function parseCollection(raw) {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    throw businessError("MISSING_PARAM", "collection is required: pass user/slug or a full collections URL");
  }
  const value = raw.trim();
  let user = null;
  let slug = null;
  if (/^https?:\/\//i.test(value)) {
    const m = value.match(/\/collections\/([^/]+)\/([^/?#]+)/);
    if (!m) {
      throw businessError("INVALID_PARAM", "collection URL must look like https://huggingface.co/collections/{user}/{slug}");
    }
    try {
      user = decodeURIComponent(m[1]);
      slug = decodeURIComponent(m[2]);
    } catch (err) {
      throw businessError("INVALID_PARAM", "collection URL contains invalid percent-encoding");
    }
  } else {
    const parts = value.split("/");
    if (parts.length !== 2) {
      throw businessError("INVALID_PARAM", "collection must be user/slug (e.g. deepseek-ai/deepseek-v4) or a full collections URL");
    }
    user = parts[0];
    slug = parts[1];
  }
  if (!user || !slug || /\s/.test(user) || /\s/.test(slug)) {
    throw businessError("INVALID_PARAM", "invalid collection format: user and slug must be non-empty and contain no spaces");
  }
  return { user, slug };
}

function itemUrl(type, id) {
  switch (type) {
    case "dataset": return HF_ORIGIN + "/datasets/" + id;
    case "space": return HF_ORIGIN + "/spaces/" + id;
    case "paper": return HF_ORIGIN + "/papers/" + id;
    case "bucket": return HF_ORIGIN + "/buckets/" + id;
    case "model":
    default: return HF_ORIGIN + "/" + id;
  }
}

// Normalize one API item to the contract shape.
function mapApiItem(it) {
  const type = it && it.type ? it.type : null;
  const id = it && it.id != null ? String(it.id) : null;
  let likes = null;
  if (type === "paper") {
    likes = it.upvotes != null ? it.upvotes : null;
  } else if (it && it.likes != null) {
    likes = it.likes;
  }
  return {
    type,
    id,
    url: id ? itemUrl(type, id) : null,
    likes,
    downloads: it && it.downloads != null ? it.downloads : null,
  };
}

export default async (page, params, cwd) => {
  const { user, slug } = parseCollection(params.collection);
  const pageUrl = HF_ORIGIN + "/collections/" + encodeURIComponent(user) + "/" + encodeURIComponent(slug);

  // Anchor on the fast homepage for same-origin, then fetch the internal API.
  // A non-existent collection returns 404 from the API without loading the (slow) Svelte 404 page.
  try {
    await page.goto(HF_ORIGIN + "/", { waitUntil: "domcontentloaded" });
  } catch (err) {
    throw businessError("NETWORK_ERROR", "failed to load huggingface.co: " + (err && err.message || err));
  }

  const apiResult = await page.evaluate(async ({ user, slug }) => {
    const rand = (n) => Math.floor(Math.random() * n);
    for (let i = 0; i < 2; i++) {
      window.scrollTo(0, rand(Math.max(200, document.body ? document.body.scrollHeight : 0)));
      const evt = new MouseEvent("mousemove", { clientX: rand(window.innerWidth), clientY: rand(window.innerHeight), bubbles: true });
      document.dispatchEvent(evt);
      await new Promise((res) => setTimeout(res, 200 + rand(350)));
    }
    window.scrollTo(0, 0);
    await new Promise((res) => setTimeout(res, 150 + rand(250)));

    const result = { status: 0, data: null, error: null };
    try {
      const res = await fetch("/api/collections/" + encodeURIComponent(user) + "/" + encodeURIComponent(slug), { headers: { Accept: "application/json" } });
      result.status = res.status;
      const body = await res.text();
      try { result.data = body ? JSON.parse(body) : null; }
      catch (err) { result.error = "unparseable response body"; }
    } catch (err) {
      result.error = String(err && err.message || err);
    }
    return result;
  }, { user, slug });

  // Prefer the internal API (exact numbers, complete metadata).
  if (apiResult.status === 200 && apiResult.data) {
    const data = apiResult.data;
    const items = Array.isArray(data.items) ? data.items.map(mapApiItem) : [];
    return {
      id: user + "/" + slug,
      title: data.title != null ? data.title : null,
      description: data.description != null ? data.description : null,
      author: data.owner ? data.owner.name : null,
      author_fullname: data.owner ? data.owner.fullname : null,
      url: pageUrl,
      upvotes: data.upvotes != null ? data.upvotes : null,
      lastUpdated: data.lastUpdated != null ? data.lastUpdated : null,
      itemCount: items.length,
      items,
    };
  }

  if (apiResult.status === 404) {
    throw businessError("NOT_FOUND", "collection not found: " + user + "/" + slug);
  }

  // DOM backup (formatted numbers only; likes/downloads unavailable).
  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  } catch (err) {
    throw businessError("NETWORK_ERROR", "failed to load collection page: " + (err && err.message || err));
  }

  const dom = await page.evaluate(() => {
    const textOf = (el) => el ? (el.innerText || "").replace(/\s+/g, " ").trim() : null;
    const typeFromHref = (href) => {
      if (!href) return null;
      if (href.indexOf("/spaces/") !== -1) return "space";
      if (href.indexOf("/datasets/") !== -1) return "dataset";
      if (href.indexOf("/papers/") !== -1) return "paper";
      if (href.indexOf("/buckets/") !== -1) return "bucket";
      return "model";
    };
    const idFromHref = (href, type) => {
      if (!href) return null;
      const prefix = type === "space" ? "/spaces/" : type === "dataset" ? "/datasets/" : type === "paper" ? "/papers/" : type === "bucket" ? "/buckets/" : "/";
      const idx = href.indexOf(prefix);
      if (idx === -1) return null;
      return href.slice(idx + prefix.length).split(/[?#]/)[0];
    };
    const cards = [...document.querySelectorAll("main article")].map((a) => {
      const hrefs = [...a.querySelectorAll("a[href]")].map((x) => x.href)
        .filter((h) => h && h.indexOf("huggingface.co") !== -1 && h.indexOf("/collections/") === -1);
      const link = hrefs[0] || null;
      const type = typeFromHref(link);
      return { link, type, id: idFromHref(link, type) };
    }).filter((c) => c.link);
    return {
      title: textOf(document.querySelector("main h2")),
      description: textOf(document.querySelector("main div.mt-3.flex.items-center")),
      author: textOf(document.querySelector("main a.underline.decoration-gray-300")),
      cards,
    };
  });

  if (dom.title) {
    const items = (dom.cards || []).map((c) => ({
      type: c.type,
      id: c.id,
      url: c.link,
      likes: null,
      downloads: null,
    }));
    return {
      id: user + "/" + slug,
      title: dom.title,
      description: dom.description,
      author: dom.author || user,
      author_fullname: null,
      url: pageUrl,
      upvotes: null,
      lastUpdated: null,
      itemCount: items.length,
      items,
      source: "dom",
    };
  }

  throw businessError("NETWORK_ERROR", "collection fetch failed: " + (apiResult.error || ("HTTP " + apiResult.status)));
};
