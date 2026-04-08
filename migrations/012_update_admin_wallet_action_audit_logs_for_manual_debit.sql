ALTER TABLE public.admin_wallet_action_audit_logs
DROP CONSTRAINT IF EXISTS admin_wallet_action_audit_logs_action_check;

ALTER TABLE public.admin_wallet_action_audit_logs
ADD CONSTRAINT admin_wallet_action_audit_logs_action_check
CHECK (action IN ('manual_credit', 'manual_debit'));
