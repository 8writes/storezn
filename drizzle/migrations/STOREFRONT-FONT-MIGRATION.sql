-- Storezn+ storefront font choice (lib/storefrontFontOptions.js). NULL =
-- platform default. Idempotent.
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "storefront_font" text;
