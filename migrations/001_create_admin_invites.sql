CREATE TABLE IF NOT EXISTS public.admin_invites (
  id uuid PRIMARY KEY,
  email character varying NOT NULL,
  role character varying NOT NULL,
  "firstName" character varying NOT NULL,
  "lastName" character varying NOT NULL,
  status character varying NOT NULL,
  "inviteTokenHash" character varying NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "invitedByAdminUsername" character varying NOT NULL,
  "invitedByAdminEmail" character varying NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_invites_email_lowercase_check CHECK (email = LOWER(email)),
  CONSTRAINT admin_invites_role_check CHECK (role IN ('super_admin', 'support', 'finance')),
  CONSTRAINT admin_invites_status_check CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_invites_pending_email_unique_idx
ON public.admin_invites (email)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS admin_invites_status_idx
ON public.admin_invites (status);

CREATE INDEX IF NOT EXISTS admin_invites_expires_at_idx
ON public.admin_invites ("expiresAt");
