/**
 * Batch job: Compute freshness_score and freshness_bucket for all properties
 * with at least one year (opening_year, last_major_renovation_year, last_soft_renovation_year).
 */

const { getPool } = require("./config");

const REFERENCE_YEAR = parseInt(process.env.FRESHNESS_REFERENCE_YEAR ?? String(new Date().getFullYear()), 10);

function computeAgeYears(row) {
  // Prefer last_major_renovation_year > last_soft_renovation_year > opening_year
  const bestYear =
    row.last_major_renovation_year ??
    row.last_soft_renovation_year ??
    row.opening_year;
  if (bestYear == null) return null;
  return REFERENCE_YEAR - bestYear;
}

function computeFreshnessScore(ageYears) {
  if (ageYears == null) return null;
  return Math.max(0, 10 - Math.min(ageYears, 10));
}

function computeFreshnessBucket(ageYears) {
  if (ageYears == null) return null;
  if (ageYears <= 1) return "0-1";
  if (ageYears <= 3) return "1-3";
  if (ageYears <= 5) return "3-5";
  return "5+";
}

async function main() {
  const pool = getPool();

  const res = await pool.query(
    `SELECT id, opening_year, last_major_renovation_year, last_soft_renovation_year
     FROM properties
     WHERE opening_year IS NOT NULL
        OR last_major_renovation_year IS NOT NULL
        OR last_soft_renovation_year IS NOT NULL`
  );

  console.log(`Computing freshness for ${res.rows.length} properties (reference_year=${REFERENCE_YEAR})`);

  let updated = 0;
  const bucketCounts = { "0-1": 0, "1-3": 0, "3-5": 0, "5+": 0 };

  for (const row of res.rows) {
    const ageYears = computeAgeYears(row);
    const score = computeFreshnessScore(ageYears);
    const bucket = computeFreshnessBucket(ageYears);

    if (bucket) bucketCounts[bucket]++;

    await pool.query(
      `UPDATE properties SET
        freshness_score = $1,
        freshness_bucket = $2,
        updated_at = now()
       WHERE id = $3`,
      [score, bucket, row.id]
    );
    updated++;
  }

  console.log("\n--- Summary ---");
  console.log("Updated:", updated);
  console.log("Buckets:", bucketCounts);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
