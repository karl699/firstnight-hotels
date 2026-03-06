/**
 * Robust web lookup for hotel opening/renovation years.
 * Uses Brave Search + Claude extraction with strict provenance and verification.
 * Only returns high-confidence results when sources are verifiable.
 */

const Anthropic = require("@anthropic-ai/sdk");
const { searchHotelOpening } = require("./web-search");

const MODEL = process.env.FRESHNESS_CLAUDE_MODEL ?? "claude-sonnet-4-20250514";
const RATE_LIMIT_MS = parseInt(process.env.FRESHNESS_RATE_LIMIT_MS ?? "1500", 10);

// Domains we trust more (official, encyclopedic, news)
const TRUSTED_DOMAINS = [
  "wikipedia.org",
  "wikidata.org",
  "booking.com",
  "tripadvisor",
  "hotels.com",
  "marriott.com",
  "hilton.com",
  "ihg.com",
  "accor.com",
  "hyatt.com",
  "radisson",
  "nh-hotels",
  "melia.com",
  "barcelo.com",
  "riu.com",
  ".gov",
  "reuters.com",
  "bloomberg.com",
  "travelweekly.com",
  "hotelnewsnow.com",
];

function isTrustedSource(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return TRUSTED_DOMAINS.some((d) => lower.includes(d));
}

let lastCallTime = 0;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function rateLimit() {
  const now = Date.now();
  if (now - lastCallTime < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - (now - lastCallTime));
  }
  lastCallTime = Date.now();
}

/**
 * @param {string} propertyName
 * @param {string} city
 * @param {string} countryCode
 * @returns {Promise<{ opening_year: number|null, last_major_renovation_year: number|null, sources: Array<{ url: string, phrase: string, year: number, type: string }>, confidence: string }>}
 */
async function extractFromWeb(propertyName, city, countryCode) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const searchResults = await searchHotelOpening(propertyName, city, countryCode);
  if (searchResults.length === 0) {
    return {
      opening_year: null,
      last_major_renovation_year: null,
      sources: [],
      confidence: "low",
    };
  }

  const context = searchResults
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}`)
    .join("\n\n");

  await rateLimit();

  const client = new Anthropic({ apiKey });
  const prompt = `You are extracting hotel opening and renovation years from web search results. Be STRICT: only return data when you find a clear, explicit statement (e.g. "opened in 2021", "renovated 2023", "inaugurated 2019"). Do NOT infer or guess.

Hotel: ${propertyName}, ${city}, ${countryCode}

Search results:
${context}

For each year you extract, you MUST cite the exact URL and the exact phrase from the snippet that states it. Only use information that appears in the snippets above.

Respond with valid JSON only, no markdown:
{
  "opening_year": number|null,
  "last_major_renovation_year": number|null,
  "sources": [
    {"url": "string", "phrase": "exact quote", "year": number, "type": "opening"|"renovation"}
  ],
  "confidence": "high"|"medium"|"low"
}

Rules:
- confidence "high" ONLY if: (a) you found explicit statement with clear year, AND (b) at least one source is from a trusted domain (wikipedia, official hotel site, major OTA, news)
- confidence "medium" if you found a statement but source is less trusted
- confidence "low" if uncertain or no clear statement
- If no clear statement found, return null for years and confidence "low"`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content?.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("No text in Claude response");
  }

  const raw = block.text.replace(/^```json?\s*|\s*```$/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON from Claude: ${e.message}`);
  }

  const currentYear = new Date().getFullYear();
  const clamp = (y) =>
    y != null && typeof y === "number" && y >= 1900 && y <= currentYear + 2 ? y : null;

  parsed.opening_year = clamp(parsed.opening_year);
  parsed.last_major_renovation_year = clamp(parsed.last_major_renovation_year);
  parsed.sources = Array.isArray(parsed.sources) ? parsed.sources : [];

  // Downgrade confidence if no trusted source for high-claim
  if (parsed.confidence === "high" && (parsed.opening_year || parsed.last_major_renovation_year)) {
    const hasTrustedSource = parsed.sources.some((s) => isTrustedSource(s.url));
    if (!hasTrustedSource) {
      parsed.confidence = "medium";
    }
  }

  return parsed;
}

module.exports = { extractFromWeb, isTrustedSource };
