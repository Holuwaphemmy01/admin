CREATE TABLE IF NOT EXISTS public.delivery_current_surge_config (
  id integer PRIMARY KEY DEFAULT 1,
  "surgeFactor" numeric(10, 2) NOT NULL,
  "fuelSurcharge" numeric(12, 2) NOT NULL DEFAULT 0,
  reason character varying NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_current_surge_config_singleton_check CHECK (id = 1),
  CONSTRAINT delivery_current_surge_config_surge_factor_check CHECK ("surgeFactor" >= 1),
  CONSTRAINT delivery_current_surge_config_fuel_surcharge_check CHECK ("fuelSurcharge" >= 0)
);
