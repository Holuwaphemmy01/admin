CREATE TABLE IF NOT EXISTS public.admin_access_audit_logs (
  id uuid PRIMARY KEY,
  "targetAdminUserId" uuid NOT NULL REFERENCES public.admin_users (id) ON DELETE CASCADE,
  "actedByAdminUserId" uuid NOT NULL REFERENCES public.admin_users (id) ON DELETE RESTRICT,
  action character varying NOT NULL,
  "previousStatus" character varying NOT NULL,
  "nextStatus" character varying NOT NULL,
  reason text NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_access_audit_logs_action_check CHECK (action IN ('revoke_access')),
  CONSTRAINT admin_access_audit_logs_previous_status_check CHECK (
    "previousStatus" IN ('invited', 'active', 'suspended', 'revoked')
  ),
  CONSTRAINT admin_access_audit_logs_next_status_check CHECK (
    "nextStatus" IN ('invited', 'active', 'suspended', 'revoked')
  )
);

CREATE INDEX IF NOT EXISTS admin_access_audit_logs_target_admin_idx
ON public.admin_access_audit_logs ("targetAdminUserId");

CREATE INDEX IF NOT EXISTS admin_access_audit_logs_acted_by_admin_idx
ON public.admin_access_audit_logs ("actedByAdminUserId");

CREATE INDEX IF NOT EXISTS admin_access_audit_logs_created_at_idx
ON public.admin_access_audit_logs ("createdAt");
