ALTER TABLE public.product
ADD COLUMN IF NOT EXISTS "policyAction" character varying,
ADD COLUMN IF NOT EXISTS "policyReason" text,
ADD COLUMN IF NOT EXISTS "policyActionAt" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "policyUpdatedByAdminUserId" uuid,
ADD COLUMN IF NOT EXISTS "removedByPolicy" boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_policy_action_check'
      AND conrelid = 'public.product'::regclass
  ) THEN
    ALTER TABLE public.product
    ADD CONSTRAINT product_policy_action_check
    CHECK ("policyAction" IS NULL OR "policyAction" IN ('flag', 'remove'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_policy_updated_by_admin_user_fk'
      AND conrelid = 'public.product'::regclass
  ) THEN
    ALTER TABLE public.product
    ADD CONSTRAINT product_policy_updated_by_admin_user_fk
    FOREIGN KEY ("policyUpdatedByAdminUserId")
    REFERENCES public.admin_users(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.product_policy_action_audit_logs (
  id uuid PRIMARY KEY,
  "targetProductId" integer NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
  "actedByAdminUserId" uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  action character varying NOT NULL,
  reason text NOT NULL,
  "previousPolicyAction" character varying,
  "previousShowProduct" boolean NOT NULL,
  "nextShowProduct" boolean NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT product_policy_action_audit_logs_action_check
    CHECK (action IN ('flag', 'remove')),
  CONSTRAINT product_policy_action_audit_logs_previous_policy_action_check
    CHECK ("previousPolicyAction" IS NULL OR "previousPolicyAction" IN ('flag', 'remove'))
);

CREATE INDEX IF NOT EXISTS product_policy_action_audit_logs_target_product_idx
ON public.product_policy_action_audit_logs ("targetProductId");

CREATE INDEX IF NOT EXISTS product_policy_action_audit_logs_acted_by_admin_idx
ON public.product_policy_action_audit_logs ("actedByAdminUserId");

CREATE INDEX IF NOT EXISTS product_policy_action_audit_logs_created_at_idx
ON public.product_policy_action_audit_logs ("createdAt");
