#!/usr/bin/env node
/**
 * Test script: Inspect provider_raw structure and extraction output.
 * Usage: DATABASE_URL=... ANTHROPIC_API_KEY=... [BRAVE_API_KEY=...] node backend/etl/freshness/test-extraction.js [limit]
 *
 * With limit=1: runs full extraction (provider + optional web) for one hotel.
 */

const { getPool } = require("../config");
const { getHotelbedsProviderId } = require("../persistence");
const { collectText } = require("./collect-text");
const { extract } = require("./extract-with-ai");
const { extractFromWeb } = require("./extract-from-web");

async function main() {
  const limit = parseInt(process.argv[2] ?? "1", 10);

  const pool = getPool();
  const providerId = await getHotelbedsProviderId(pool);

  const res = await pool.query(
    `SELECT pp.provider_raw, p.name, p.city, p.country_code
     FROM provider_properties pp
     JOIN properties p ON p.id = pp.property_id
     WHERE pp.provider_id = $1 AND pp.provider_raw IS NOT NULL
     LIMIT $2`,
    [providerId, limit]
  );

  console.log(`\n=== Testing ${res.rows.length} hotel(s) ===\n`);

  for (let i = 0; i < res.rows.length; i++) {
    const row = res.rows[i];
    const raw = row.provider_raw;

    console.log(`--- Hotel ${i + 1}: ${row.name} (${row.city}, ${row.country_code}) ---`);

    // Show top-level keys of provider_raw
    console.log("\nprovider_raw top-level keys:", Object.keys(raw || {}).join(", "));

    const text = collectText(raw);
    console.log("\nCollected text length:", text.length);
    if (text.length > 0) {
      console.log("First 500 chars:", text.slice(0, 500));
    } else {
      console.log("(no text collected - check structure)");
      if (raw?.description) console.log("raw.description:", JSON.stringify(raw.description).slice(0, 200));
      if (raw?.descriptions) console.log("raw.descriptions:", JSON.stringify(raw.descriptions).slice(0, 300));
    }

    if (process.env.ANTHROPIC_API_KEY) {
      const extracted = await extract(row.name, text);
      console.log("\nProvider extraction result:", JSON.stringify(extracted, null, 2));

      const needsWeb =
        !extracted.opening_year &&
        !extracted.last_major_renovation_year &&
        process.env.BRAVE_API_KEY &&
        row.city &&
        row.country_code;

      if (needsWeb) {
        console.log("\n--- Web lookup (no years from provider) ---");
        try {
          const webResult = await extractFromWeb(row.name, row.city, row.country_code);
          console.log("Web result:", JSON.stringify(webResult, null, 2));
        } catch (e) {
          console.error("Web lookup error:", e.message);
        }
      }
    } else {
      console.log("\n(Set ANTHROPIC_API_KEY to run extraction)");
    }
    console.log("");
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
