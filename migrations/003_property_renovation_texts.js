/**
 * Adds property_renovation_texts table for audit trail of web-fetched sources.
 * See docs/DATA_MODEL_PROPERTIES.md.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("property_renovation_texts", {
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
    source_type: { type: "text", notNull: true },
    source_name: { type: "text" },
    source_url: { type: "text" },
    language: { type: "text" },
    captured_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    raw_text: { type: "text", notNull: true },
    extracted_years: { type: "jsonb" },
    notes: { type: "text" },
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
  pgm.createIndex("property_renovation_texts", ["property_id"]);
};

exports.down = (pgm) => {
  pgm.dropTable("property_renovation_texts");
};
