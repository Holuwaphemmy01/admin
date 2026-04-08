ALTER TABLE public.user_access_audit_logs
DROP CONSTRAINT IF EXISTS user_access_audit_logs_action_check;

ALTER TABLE public.user_access_audit_logs
ADD CONSTRAINT user_access_audit_logs_action_check
CHECK (action IN ('suspend_account', 'reactivate_account'));

ALTER TABLE public.user_access_audit_logs
ALTER COLUMN comment DROP NOT NULL;
