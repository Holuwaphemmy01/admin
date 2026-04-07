CREATE TABLE IF NOT EXISTS public.user_access_audit_logs (
  id uuid PRIMARY KEY,
  "targetUserId" integer NOT NULL REFERENCES public."user" (id) ON DELETE CASCADE,
  "actedByAdminUserId" uuid NOT NULL REFERENCES public.admin_users (id) ON DELETE RESTRICT,
  action character varying NOT NULL,
  "previousStatus" integer NOT NULL,
  "nextStatus" integer NOT NULL,
  comment text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT user_access_audit_logs_action_check CHECK (action IN ('suspend_account')),
  CONSTRAINT user_access_audit_logs_previous_status_check CHECK ("previousStatus" IN (1, 2)),
  CONSTRAINT user_access_audit_logs_next_status_check CHECK ("nextStatus" IN (1, 2))
);

CREATE INDEX IF NOT EXISTS user_access_audit_logs_target_user_idx
ON public.user_access_audit_logs ("targetUserId");

CREATE INDEX IF NOT EXISTS user_access_audit_logs_acted_by_admin_idx
ON public.user_access_audit_logs ("actedByAdminUserId");

CREATE INDEX IF NOT EXISTS user_access_audit_logs_created_at_idx
ON public.user_access_audit_logs ("createdAt");
