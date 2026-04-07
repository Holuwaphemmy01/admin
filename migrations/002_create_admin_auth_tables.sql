CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY,
  username character varying NULL,
  "emailAddress" character varying NOT NULL UNIQUE,
  "phoneNumber" character varying NULL,
  "firstName" character varying NOT NULL,
  "lastName" character varying NOT NULL,
  role character varying NOT NULL,
  "userTypeId" integer NOT NULL,
  status character varying NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_users_email_lowercase_check CHECK ("emailAddress" = LOWER("emailAddress")),
  CONSTRAINT admin_users_role_check CHECK (role IN ('super_admin', 'support', 'finance')),
  CONSTRAINT admin_users_status_check CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  CONSTRAINT admin_users_user_type_id_check CHECK ("userTypeId" = 4)
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_unique_idx
ON public.admin_users (LOWER(username))
WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_phone_unique_idx
ON public.admin_users ("phoneNumber")
WHERE "phoneNumber" IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_users_status_idx
ON public.admin_users (status);

CREATE TABLE IF NOT EXISTS public.admin_credentials (
  "adminUserId" uuid PRIMARY KEY REFERENCES public.admin_users (id) ON DELETE CASCADE,
  "passwordHash" character varying NOT NULL,
  "passwordVersion" integer NOT NULL DEFAULT 1,
  "passwordChangedAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_credentials_password_version_check CHECK ("passwordVersion" >= 1)
);
