/**
 * Collects text from Hotelbeds provider_raw for AI extraction.
 * Handles description, facilities, segments, and other text fields.
 */

const MAX_CHARS = 8000;

function extractText(val) {
  if (val == null) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object" && val.content) return String(val.content).trim();
  if (typeof val === "object" && val.description) return extractText(val.description);
  return "";
}

function collectFromArray(arr, path = "") {
  if (!Array.isArray(arr)) return [];
  const parts = [];
  for (const item of arr) {
    if (item && typeof item === "object") {
      const text = extractText(item.description ?? item.content ?? item.name ?? item);
      if (text) parts.push(text);
      if (item.facilities) parts.push(...collectFromArray(item.facilities, "facilities"));
      if (item.descriptions) parts.push(...collectFromArray(item.descriptions, "descriptions"));
    }
  }
  return parts;
}

/**
 * @param {object} providerRaw - Hotelbeds hotel JSON (provider_raw)
 * @returns {string} Concatenated text, max ~8k chars
 */
function collectText(providerRaw) {
  if (!providerRaw || typeof providerRaw !== "object") return "";

  const parts = [];

  // Main description
  const desc = extractText(providerRaw.description ?? providerRaw.descriptions?.[0]);
  if (desc) parts.push(desc);

  // Facilities (often contain renovation info)
  const facilities = providerRaw.facilities ?? providerRaw.facilityGroups ?? [];
  for (const f of facilities) {
    const text = extractText(f.description ?? f.content ?? f.name);
    if (text) parts.push(text);
    if (Array.isArray(f.facilities)) {
      for (const sub of f.facilities) {
        const subText = extractText(sub.description ?? sub.content ?? sub.name);
        if (subText) parts.push(subText);
      }
    }
  }

  // Segments / room types
  const segments = providerRaw.segments ?? providerRaw.rooms ?? [];
  for (const s of segments) {
    const text = extractText(s.description ?? s.content ?? s.name);
    if (text) parts.push(text);
  }

  // Board / additional info
  const board = extractText(providerRaw.board ?? providerRaw.boardDescription);
  if (board) parts.push(board);

  // Chain / brand description
  const chainDesc = extractText(providerRaw.chain?.description ?? providerRaw.chain?.content);
  if (chainDesc) parts.push(chainDesc);

  const combined = parts.filter(Boolean).join("\n\n").trim();
  return combined.length > MAX_CHARS ? combined.slice(0, MAX_CHARS) + "…" : combined;
}

module.exports = { collectText, MAX_CHARS };
