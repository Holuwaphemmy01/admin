export const ADMIN_ROLES = ["super_admin", "support", "finance"] as const;
export const ADMIN_STATUSES = ["invited", "active", "suspended", "revoked"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type AdminStatus = (typeof ADMIN_STATUSES)[number];
