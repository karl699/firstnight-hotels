/**
 * Initial database schema for FirstNightHotels.
 *
 * This mirrors the first normalized data model described in docs/DATA_MODEL_PROPERTIES.md.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createTable("providers", {
    id: "id",
    name: { type: "text", notNull: true, unique: true },
    kind: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint("providers", "providers_kind_check", {
    check: "kind IN ('bedsbank', 'gds', 'ota', 'content_only')",
  });

  pgm.createTable("properties", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    type: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
    brand: { type: "text" },
    chain: { type: "text" },

    country_code: { type: "char(2)", notNull: true },
    city: { type: "text", notNull: true },
    address_line1: { type: "text" },
    address_line2: { type: "text" },
    postal_code: { type: "text" },
    latitude: { type: "double precision" },
    longitude: { type: "double precision" },

    opening_year: { type: "integer" },
    last_major_renovation_year: { type: "integer" },
    last_soft_renovation_year: { type: "integer" },
    last_rebranding_year: { type: "integer" },

    freshness_score: { type: "numeric(4,2)" },
    freshness_bucket: { type: "text" },

    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint("properties", "properties_type_check", {
    check: "type IN ('hotel', 'aparthotel', 'serviced_apartment')",
  });
  pgm.createIndex("properties", ["country_code", "city"]);

  pgm.createTable("property_renovations", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    property_id: {
      type: "uuid",
      notNull: true,
      references: "properties",
      onDelete: "CASCADE",
    },
    year: { type: "integer", notNull: true },
    scope: { type: "text", notNull: true },
    description: { type: "text" },
    source: { type: "text", notNull: true },
    source_details: { type: "jsonb" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.createIndex("property_renovations", ["property_id"]);

  pgm.createTable("provider_properties", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    provider_id: {
      type: "integer",
      notNull: true,
      references: "providers",
      onDelete: "CASCADE",
    },
    provider_hotel_id: { type: "text", notNull: true },
    property_id: {
      type: "uuid",
      notNull: true,
      references: "properties",
      onDelete: "CASCADE",
    },
    provider_raw: { type: "jsonb" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint("provider_properties", "provider_properties_provider_unique", {
    unique: ["provider_id", "provider_hotel_id"],
  });
  pgm.createIndex("provider_properties", ["property_id"]);
};

exports.down = (pgm) => {
  pgm.dropTable("provider_properties");
  pgm.dropTable("property_renovations");
  pgm.dropTable("properties");
  pgm.dropTable("providers");
};

