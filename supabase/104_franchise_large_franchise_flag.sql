ALTER TABLE public.franchise_applications
  ADD COLUMN IF NOT EXISTS is_large_franchise BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS franchise_applications_is_large_franchise_idx
  ON public.franchise_applications (is_large_franchise)
  WHERE is_large_franchise = TRUE;
