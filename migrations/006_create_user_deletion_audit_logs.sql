CREATE TABLE IF NOT EXISTS public.user_deletion_audit_logs (
  id uuid PRIMARY KEY,
  "deletedUserId" integer NOT NULL,
  "deletedUsername" character varying NOT NULL,
  "deletedEmailAddress" character varying NULL,
  "deletedUserTypeId" integer NOT NULL,
  "actedByAdminUserId" uuid NOT NULL REFERENCES public.admin_users (id) ON DELETE RESTRICT,
  reason text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_deletion_audit_logs_deleted_user_idx
ON public.user_deletion_audit_logs ("deletedUserId");

CREATE INDEX IF NOT EXISTS user_deletion_audit_logs_acted_by_admin_idx
ON public.user_deletion_audit_logs ("actedByAdminUserId");

CREATE INDEX IF NOT EXISTS user_deletion_audit_logs_created_at_idx
ON public.user_deletion_audit_logs ("createdAt");
