CREATE TABLE IF NOT EXISTS public.admin_settlement_rejection_audit_logs (
  id uuid PRIMARY KEY,
  "settlementId" integer NOT NULL REFERENCES public.settlement(id) ON DELETE CASCADE,
  "targetUserId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "actedByAdminUserId" uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  "previousStatus" integer NOT NULL,
  "newStatus" integer NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_settlement_rejection_audit_logs_settlement_id_idx
ON public.admin_settlement_rejection_audit_logs ("settlementId");

CREATE INDEX IF NOT EXISTS admin_settlement_rejection_audit_logs_target_user_id_idx
ON public.admin_settlement_rejection_audit_logs ("targetUserId");

CREATE INDEX IF NOT EXISTS admin_settlement_rejection_audit_logs_acted_by_admin_user_id_idx
ON public.admin_settlement_rejection_audit_logs ("actedByAdminUserId");

CREATE INDEX IF NOT EXISTS admin_settlement_rejection_audit_logs_created_at_idx
ON public.admin_settlement_rejection_audit_logs ("createdAt");
