CREATE TABLE IF NOT EXISTS public.admin_order_action_audit_logs (
  id uuid PRIMARY KEY,
  "targetOrderId" integer NOT NULL REFERENCES public.order_tb(id) ON DELETE CASCADE,
  "actedByAdminUserId" uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  action character varying NOT NULL,
  "previousStatus" integer NOT NULL,
  "nextStatus" integer NOT NULL,
  "orderNumber" character varying NOT NULL,
  reason text NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_order_action_audit_logs_action_check
    CHECK (action IN ('force_cancel'))
);

CREATE INDEX IF NOT EXISTS admin_order_action_audit_logs_target_order_idx
ON public.admin_order_action_audit_logs ("targetOrderId");

CREATE INDEX IF NOT EXISTS admin_order_action_audit_logs_acted_by_admin_idx
ON public.admin_order_action_audit_logs ("actedByAdminUserId");

CREATE INDEX IF NOT EXISTS admin_order_action_audit_logs_created_at_idx
ON public.admin_order_action_audit_logs ("createdAt");
