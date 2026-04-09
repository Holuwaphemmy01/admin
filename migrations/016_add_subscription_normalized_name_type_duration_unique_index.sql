CREATE UNIQUE INDEX IF NOT EXISTS subscription_active_normalized_name_type_duration_unique_idx
ON public.subscription (LOWER(BTRIM(name)), type, duration)
WHERE COALESCE(status, 1) = 1;
