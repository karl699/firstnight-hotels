const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// Prefer Scalingo-specific env var if present, fall back to generic DATABASE_URL.
const databaseUrl =
  process.env.SCALINGO_POSTGRESQL_URL || process.env.DATABASE_URL;

let pool;

if (databaseUrl) {
  const isLocalhost =
    /localhost|127\.0\.0\.1/.test(databaseUrl) ||
    process.env.PGSSLMODE === "disable";
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
  });
} else {
  console.warn(
    "No database URL configured. Set SCALINGO_POSTGRESQL_URL or DATABASE_URL."
  );
}

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "API is running" });
});

app.get("/search", async (req, res) => {
  if (!pool) {
    return res.status(500).json({
      error: "Database not configured",
    });
  }

  const city = (req.query.city ?? req.query.q ?? "").trim();
  const countryCode = (req.query.country_code ?? req.query.country ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const limit = Math.min(
    parseInt(req.query.limit ?? "20", 10) || 20,
    100
  );
  const offset = Math.max(parseInt(req.query.offset ?? "0", 10) || 0, 0);

  if (!city) {
    return res.status(400).json({
      error: "Missing required parameter: city or q (location search term)",
    });
  }

  try {
    const params = [];
    const conditions = ["city ILIKE $1"];
    params.push(`%${city}%`);

    if (countryCode) {
      params.push(countryCode);
      conditions.push(`country_code = $${params.length}`);
    }

    const whereClause = conditions.join(" AND ");

    const [countResult, dataResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total FROM properties WHERE ${whereClause}`,
        params
      ),
      pool.query(
        `SELECT id, type, name, brand, chain, country_code, city,
                address_line1, latitude, longitude,
                opening_year, last_major_renovation_year, last_soft_renovation_year,
                freshness_score, freshness_bucket
         FROM properties
         WHERE ${whereClause}
         ORDER BY freshness_score DESC NULLS LAST, last_major_renovation_year DESC NULLS LAST, opening_year DESC NULLS LAST, name
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
    ]);

    res.json({
      total: countResult.rows[0].total,
      properties: dataResult.rows,
    });
  } catch (error) {
    console.error("Search failed:", error);
    res.status(500).json({
      error: "Search failed",
    });
  }
});

app.get("/db-check", async (req, res) => {
  if (!pool) {
    return res.status(500).json({
      ok: false,
      error: "Database URL not configured",
    });
  }

  try {
    const result = await pool.query("SELECT 1");
    res.json({
      ok: true,
      result: result.rows[0],
    });
  } catch (error) {
    console.error("Database connectivity check failed:", error);
    res.status(500).json({
      ok: false,
      error: "Database connectivity check failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`FirstNightHotels API listening on port ${PORT}`);
});

