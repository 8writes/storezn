-- Existing preferences predate the configurable Condition field. Version 1
-- lets the API add it once on the owner's next form load; after that, version
-- 2 preserves the owner's explicit show/hide choice. Safe to run repeatedly.
ALTER TABLE vendor_product_form_preferences
  ADD COLUMN IF NOT EXISTS visible_fields_version integer NOT NULL DEFAULT 1;
