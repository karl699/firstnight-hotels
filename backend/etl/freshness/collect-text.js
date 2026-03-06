/**
 * Collects text from Hotelbeds provider_raw for AI extraction.
 * Handles description, facilities, segments, and other text fields.
 * Hotelbeds uses { content: "..." } for localized strings.
 */

const MAX_CHARS = 8000;

function extractText(val) {
  if (val == null) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object" && val.content) return String(val.content).trim();
  if (typeof val === "object" && val.description) return extractText(val.description);
  if (typeof val === "object" && val.value) return String(val.value).trim();
  return "";
}

function collectFromArray(arr) {
  if (!Array.isArray(arr)) return [];
  const parts = [];
  for (const item of arr) {
    if (item && typeof item === "object") {
      const text = extractText(item.description ?? item.content ?? item.name ?? item);
      if (text) parts.push(text);
      if (item.facilities) parts.push(...collectFromArray(item.facilities));
      if (item.descriptions) parts.push(...collectFromArray(item.descriptions));
    }
  }
  return parts;
}

/** Recursively collect any .content or .description from nested objects (fallback) */
function collectNestedContent(obj, seen = new Set(), depth = 0) {
  if (depth > 5 || !obj || typeof obj !== "object" || seen.has(obj)) return [];
  seen.add(obj);
  const parts = [];
  if (obj.content && typeof obj.content === "string") {
    const t = obj.content.trim();
    if (t.length > 20) parts.push(t);
  }
  if (obj.description && typeof obj.description === "string") {
    const t = obj.description.trim();
    if (t.length > 20) parts.push(t);
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (const item of v) parts.push(...collectNestedContent(item, seen, depth + 1));
    } else if (v && typeof v === "object") {
      parts.push(...collectNestedContent(v, seen, depth + 1));
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

  // Main description (Hotelbeds: description.content or descriptions[].content)
  const desc = extractText(providerRaw.description ?? providerRaw.descriptions?.[0]);
  if (desc) parts.push(desc);
  if (Array.isArray(providerRaw.descriptions)) {
    for (const d of providerRaw.descriptions) {
      const t = extractText(d);
      if (t) parts.push(t);
    }
  }

  // hotelDescriptions, hotelDescription (alternate names)
  const hotelDesc = extractText(providerRaw.hotelDescription ?? providerRaw.hotelDescriptions?.[0]);
  if (hotelDesc) parts.push(hotelDesc);

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

  // Address (sometimes has content)
  const addr = extractText(providerRaw.address);
  if (addr) parts.push(addr);

  // Fallback: recursively find any content/description in nested structure
  if (parts.length === 0) {
    const nested = collectNestedContent(providerRaw);
    parts.push(...nested);
  }

  const combined = parts.filter(Boolean).join("\n\n").trim();
  return combined.length > MAX_CHARS ? combined.slice(0, MAX_CHARS) + "…" : combined;
}

module.exports = { collectText, MAX_CHARS };
