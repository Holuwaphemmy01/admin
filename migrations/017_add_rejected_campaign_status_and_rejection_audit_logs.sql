DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    INNER JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'enum_promote_post_campaign_status'
      AND e.enumlabel = 'rejected'
  ) THEN
    ALTER TYPE public.enum_promote_post_campaign_status ADD VALUE 'rejected';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_campaign_rejection_audit_logs (
  id uuid PRIMARY KEY,
  "campaignId" bigint NOT NULL REFERENCES public.promote_post_campaign (id) ON DELETE CASCADE,
  "targetUserId" bigint NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE,
  "actedByAdminUserId" uuid NOT NULL REFERENCES public.admin_users (id) ON DELETE RESTRICT,
  reason text NOT NULL,
  "previousStatus" character varying NOT NULL,
  "newStatus" character varying NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_campaign_rejection_audit_logs_campaign_idx
ON public.admin_campaign_rejection_audit_logs ("campaignId");

CREATE INDEX IF NOT EXISTS admin_campaign_rejection_audit_logs_target_user_idx
ON public.admin_campaign_rejection_audit_logs ("targetUserId");

CREATE INDEX IF NOT EXISTS admin_campaign_rejection_audit_logs_acted_by_admin_idx
ON public.admin_campaign_rejection_audit_logs ("actedByAdminUserId");

CREATE INDEX IF NOT EXISTS admin_campaign_rejection_audit_logs_created_at_idx
ON public.admin_campaign_rejection_audit_logs ("createdAt");
