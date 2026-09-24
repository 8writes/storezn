-- Storefront home tagline: whether the store description is shown under
-- the store name. Defaults on (existing stores with a description start
-- showing it as the tagline). Safe to re-run.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS show_description boolean NOT NULL DEFAULT true;
