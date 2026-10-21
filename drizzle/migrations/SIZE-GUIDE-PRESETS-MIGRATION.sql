-- Saved size guides, reused across a store's products. Idempotent.
CREATE TABLE IF NOT EXISTS "size_guide_presets" (
  "id" text PRIMARY KEY,
  "store_id" text NOT NULL REFERENCES "stores"("id"),
  "name" text NOT NULL,
  "guide" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_size_guide_presets_store_id" ON "size_guide_presets" ("store_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_size_guide_presets_store_name" ON "size_guide_presets" ("store_id", lower("name"));

-- Deleting a preset unlinks its products; each keeps its own copy in size_guide.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "size_guide_preset_id" text
  REFERENCES "size_guide_presets"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_products_size_guide_preset_id" ON "products" ("size_guide_preset_id");
