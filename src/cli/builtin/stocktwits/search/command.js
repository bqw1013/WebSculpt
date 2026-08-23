// stocktwits/search — entity search (symbols + users) via the public search.json endpoint.
// Node runtime contract: export default async function(params), Node builtins only, serializable return.

const SEARCH_URL = "https://api.stocktwits.com/api/2/search.json";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15000;
// UA=Chrome is required by the explore evidence for a clean JSON response.
const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Polite pacing: random 200-700ms delay before each HTTP request.
function randomDelay() {
  return 200 + Math.floor(Math.random() * 500);
}

function commandError(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

// Fetch the search endpoint with retry/backoff on 429/403/5xx/connection errors.
async function fetchJson(url) {
  let lastCode = "API_ERROR";
  let lastMessage = "Stocktwits search failed";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await sleep(randomDelay());
    let controller = null;
    try {
      controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(url, {
          headers: { "User-Agent": UA_CHROME, "Accept": "application/json" },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (response.status === 429 || response.status === 403) {
        lastCode = "RATE_LIMITED";
        lastMessage = `Stocktwits search rate-limited (HTTP ${response.status})`;
        await sleep(1000 * attempt);
        continue;
      }
      if (response.status >= 500) {
        lastCode = "API_ERROR";
        lastMessage = `Stocktwits search server error (HTTP ${response.status})`;
        await sleep(1000 * attempt);
        continue;
      }
      if (!response.ok) {
        commandError("API_ERROR", `Stocktwits search returned HTTP ${response.status}`);
      }
      const text = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch (parseError) {
        // Non-JSON body: drift/server-side; retry once, then surface API_ERROR.
        lastCode = "API_ERROR";
        lastMessage = "Stocktwits search returned a non-JSON response";
        await sleep(1000 * attempt);
        continue;
      }
      return { status: response.status, payload };
    } catch (error) {
      // Do not swallow a deliberately thrown business error (has a code).
      if (error && error.code) throw error;
      // Connection drop / abort / timeout: backoff and retry.
      lastCode = "NETWORK_ERROR";
      lastMessage =
        error && error.name === "AbortError"
          ? "Stocktwits search request timed out"
          : `Stocktwits search network error: ${error && error.message ? error.message : "unknown"}`;
      await sleep(1000 * attempt);
    }
  }
  commandError(lastCode, lastMessage);
}

export default async function(params) {
  const query = params.query == null ? "" : String(params.query).trim();
  if (!query) commandError("MISSING_PARAM", "query is required");

  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}`;
  const { status, payload } = await fetchJson(url);

  if (!payload || !Array.isArray(payload.results)) {
    commandError("API_ERROR", `Unexpected response shape (HTTP ${status})`);
  }

  // Split the flat results[] by the "type" discriminator.
  const symbols = [];
  const users = [];
  for (const item of payload.results) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "symbol") {
      symbols.push({
        id: item.id,
        symbol: item.symbol,
        title: item.title,
        exchange: item.exchange,
        // watchlist_count/country are optional — only include when the API provides them.
        ...(item.watchlist_count != null ? { watchlistCount: item.watchlist_count } : {}),
        ...(typeof item.country === "string" && item.country ? { country: item.country } : {}),
      });
    } else if (item.type === "user") {
      users.push({
        id: item.id,
        username: item.username,
        name: item.name,
        avatarUrl: item.avatar_url || null,
        official: item.official === true,
        premium: item.premium === true,
        verified: item.verified === true,
        // company_representative is optional — only include when present.
        ...(item.company_representative != null ? { companyRepresentative: item.company_representative } : {}),
      });
    }
  }

  return { query, symbols, users };
}
