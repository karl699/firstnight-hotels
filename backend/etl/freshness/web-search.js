/**
 * Web search via Brave Search API.
 * Env: BRAVE_API_KEY
 * Free tier: $5/month credits. See https://brave.com/search/api
 */

const RATE_LIMIT_MS = parseInt(process.env.FRESHNESS_WEB_SEARCH_RATE_LIMIT_MS ?? "500", 10);
let lastCallTime = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastCallTime = Date.now();
}

/**
 * @param {string} query - Search query
 * @param {number} [count=10] - Max results
 * @returns {Promise<{ organic: Array<{ title: string, link: string, snippet: string }> }>}
 */
async function search(query, count = 10) {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error("BRAVE_API_KEY not set");
  }

  await rateLimit();

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(count, 20)));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-Subscription-Token": apiKey,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brave API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const results = data.web?.results ?? [];
  return {
    organic: results.map((r) => ({
      title: r.title ?? "",
      link: r.url ?? r.link ?? "",
      snippet: r.description ?? r.snippet ?? "",
    })),
  };
}

/**
 * Search for hotel opening/renovation info. Runs multiple queries for robustness.
 * @param {string} propertyName
 * @param {string} city
 * @param {string} countryCode - e.g. DE, ES
 * @returns {Promise<Array<{ title: string, link: string, snippet: string }>>}
 */
async function searchHotelOpening(propertyName, city, countryCode) {
  const queries = [
    `"${propertyName}" ${city} ${countryCode} opening year`,
    `"${propertyName}" ${city} opened inaugurated`,
    `"${propertyName}" ${city} eröffnet`,
    `"${propertyName}" ${city} renovation`,
  ];

  const seen = new Set();
  const results = [];

  for (const q of queries) {
    try {
      const { organic } = await search(q, 5);
      for (const r of organic) {
        const key = r.link;
        if (!seen.has(key) && r.snippet) {
          seen.add(key);
          results.push(r);
        }
      }
    } catch (err) {
      console.warn(`[web-search] Query failed "${q}":`, err.message);
    }
  }

  return results.slice(0, 15);
}

module.exports = { search, searchHotelOpening };
