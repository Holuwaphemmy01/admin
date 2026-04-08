CREATE UNIQUE INDEX IF NOT EXISTS product_category_normalized_name_unique_idx
ON public.product_category ((LOWER(BTRIM(name))))
WHERE name IS NOT NULL AND BTRIM(name) <> '';
