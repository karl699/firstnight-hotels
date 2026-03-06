/**
 * Batch job: Extract opening/renovation years from provider_raw via Claude,
 * update properties and optionally property_renovations.
 */

const { getPool } = require("./config");
const { getHotelbedsProviderId } = require("./persistence");
const { collectText } = require("./freshness/collect-text");
const { extract } = require("./freshness/extract-with-ai");

const FORCE_ALL = process.env.FRESHNESS_FORCE_ALL === "true";
const LIMIT = process.env.FRESHNESS_LIMIT ? parseInt(process.env.FRESHNESS_LIMIT, 10) : null;
const MIN_CONFIDENCE = process.env.FRESHNESS_MIN_CONFIDENCE ?? "low"; // low | medium | high

const CONFIDENCE_ORDER = { low: 0, medium: 1, high: 2 };

async function loadCandidates(pool, providerId) {
  const forceClause = FORCE_ALL
    ? ""
    : `AND (p.opening_year IS NULL AND p.last_major_renovation_year IS NULL)`;

  let query = `SELECT pp.id AS pp_id, pp.property_id, pp.provider_raw, p.name AS property_name
     FROM provider_properties pp
     JOIN properties p ON p.id = pp.property_id
     WHERE pp.provider_id = $1 AND pp.provider_raw IS NOT NULL ${forceClause}
     ORDER BY pp.updated_at ASC`;
  const params = [providerId];

  if (LIMIT != null && LIMIT > 0) {
    query += ` LIMIT $2`;
    params.push(LIMIT);
  }

  const res = await pool.query(query, params);
  return res.rows;
}

async function updatePropertyYears(pool, propertyId, extracted) {
  await pool.query(
    `UPDATE properties SET
      opening_year = $1,
      last_major_renovation_year = $2,
      last_soft_renovation_year = $3,
      last_rebranding_year = $4,
      updated_at = now()
     WHERE id = $5`,
    [
      extracted.opening_year,
      extracted.last_major_renovation_year,
      extracted.last_soft_renovation_year,
      extracted.last_rebranding_year,
      propertyId,
    ]
  );
}

async function upsertRenovations(pool, propertyId, renovations) {
  if (!Array.isArray(renovations) || renovations.length === 0) return;

  for (const r of renovations) {
    const existing = await pool.query(
      `SELECT id FROM property_renovations
       WHERE property_id = $1 AND year = $2 AND scope = $3`,
      [propertyId, r.year, r.scope]
    );
    if (existing.rows.length > 0) continue;

    await pool.query(
      `INSERT INTO property_renovations (property_id, year, scope, description, source, source_details)
       VALUES ($1, $2, $3, $4, 'ai_extracted', $5)`,
      [
        propertyId,
        r.year,
        r.scope,
        r.description ?? null,
        JSON.stringify({ confidence: "ai" }),
      ]
    );
  }
}

function shouldApply(extracted) {
  const min = CONFIDENCE_ORDER[MIN_CONFIDENCE] ?? 0;
  const actual = CONFIDENCE_ORDER[extracted.confidence] ?? 0;
  return actual >= min || FORCE_ALL;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set. Aborting.");
    process.exit(1);
  }

  const pool = getPool();
  const providerId = await getHotelbedsProviderId(pool);

  const candidates = await loadCandidates(pool, providerId);
  console.log(
    `Found ${candidates.length} properties to process (FORCE_ALL=${FORCE_ALL}, LIMIT=${LIMIT ?? "none"})`
  );

  const stats = { processed: 0, updated: 0, skipped: 0, errors: 0, confidence: {} };

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    const text = collectText(row.provider_raw);

    try {
      const extracted = await extract(row.property_name, text);
      stats.confidence[extracted.confidence] = (stats.confidence[extracted.confidence] ?? 0) + 1;

      if (!shouldApply(extracted)) {
        stats.skipped++;
        console.log(`[${i + 1}/${candidates.length}] ${row.property_name}: skipped (confidence=${extracted.confidence})`);
        continue;
      }

      await updatePropertyYears(pool, row.property_id, extracted);
      await upsertRenovations(pool, row.property_id, extracted.renovations ?? []);

      stats.updated++;
      const years = [
        extracted.opening_year,
        extracted.last_major_renovation_year,
        extracted.last_soft_renovation_year,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`[${i + 1}/${candidates.length}] ${row.property_name}: ${years || "none"} (${extracted.confidence})`);
    } catch (err) {
      stats.errors++;
      console.error(`[${i + 1}/${candidates.length}] ${row.property_name}: ERROR`, err.message);
    }
    stats.processed++;
  }

  console.log("\n--- Summary ---");
  console.log("Processed:", stats.processed);
  console.log("Updated:", stats.updated);
  console.log("Skipped:", stats.skipped);
  console.log("Errors:", stats.errors);
  console.log("Confidence:", stats.confidence);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
