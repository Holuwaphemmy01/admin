CREATE TABLE IF NOT EXISTS public.admin_wallet_action_audit_logs (
  id uuid PRIMARY KEY,
  "targetUserId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "targetWalletId" integer NOT NULL REFERENCES public.wallet(id) ON DELETE CASCADE,
  "walletTransactionId" integer NOT NULL REFERENCES public.wallet_transaction(id) ON DELETE CASCADE,
  "actedByAdminUserId" uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  action character varying NOT NULL,
  amount double precision NOT NULL,
  description text NOT NULL,
  "previousAvailableBalance" double precision NOT NULL,
  "newAvailableBalance" double precision NOT NULL,
  "previousLedgerBalance" double precision NOT NULL,
  "newLedgerBalance" double precision NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_wallet_action_audit_logs_action_check CHECK (action IN ('manual_credit'))
);

CREATE INDEX IF NOT EXISTS admin_wallet_action_audit_logs_target_user_id_idx
ON public.admin_wallet_action_audit_logs ("targetUserId");

CREATE INDEX IF NOT EXISTS admin_wallet_action_audit_logs_target_wallet_id_idx
ON public.admin_wallet_action_audit_logs ("targetWalletId");

CREATE INDEX IF NOT EXISTS admin_wallet_action_audit_logs_wallet_transaction_id_idx
ON public.admin_wallet_action_audit_logs ("walletTransactionId");

CREATE INDEX IF NOT EXISTS admin_wallet_action_audit_logs_acted_by_admin_user_id_idx
ON public.admin_wallet_action_audit_logs ("actedByAdminUserId");

CREATE INDEX IF NOT EXISTS admin_wallet_action_audit_logs_created_at_idx
ON public.admin_wallet_action_audit_logs ("createdAt");
