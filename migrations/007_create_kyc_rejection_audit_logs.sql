CREATE TABLE IF NOT EXISTS public.kyc_rejection_audit_logs (
  id uuid PRIMARY KEY,
  "targetUserId" integer NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE,
  "targetKycId" integer NOT NULL REFERENCES public.kyc (id) ON DELETE CASCADE,
  "actedByAdminUserId" uuid NOT NULL REFERENCES public.admin_users (id) ON DELETE RESTRICT,
  reason text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kyc_rejection_audit_logs_target_user_idx
ON public.kyc_rejection_audit_logs ("targetUserId");

CREATE INDEX IF NOT EXISTS kyc_rejection_audit_logs_target_kyc_idx
ON public.kyc_rejection_audit_logs ("targetKycId");

CREATE INDEX IF NOT EXISTS kyc_rejection_audit_logs_acted_by_admin_idx
ON public.kyc_rejection_audit_logs ("actedByAdminUserId");

CREATE INDEX IF NOT EXISTS kyc_rejection_audit_logs_created_at_idx
ON public.kyc_rejection_audit_logs ("createdAt");
