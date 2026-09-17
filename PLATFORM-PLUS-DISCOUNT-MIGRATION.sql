ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS plus_intro_discount_percent real;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_settings_plus_intro_discount_percent_check'
  ) THEN
    ALTER TABLE platform_settings
      ADD CONSTRAINT platform_settings_plus_intro_discount_percent_check
      CHECK (plus_intro_discount_percent IS NULL OR (plus_intro_discount_percent >= 1 AND plus_intro_discount_percent <= 99));
  END IF;
END $$;
