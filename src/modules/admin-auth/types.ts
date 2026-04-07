import { AdminRole, AdminStatus } from "../admin/types";

export { ADMIN_ROLES, ADMIN_STATUSES } from "../admin/types";
export type { AdminRole, AdminStatus } from "../admin/types";

export interface AdminLoginRequestBody {
  username: string;
  password: string;
}

export interface AdminLoginResponse {
  username: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  userTypeId: number;
  token: string;
  createdAt?: string;
}

export interface AdminInviteRequestBody {
  email: string;
  role: AdminRole;
  firstName: string;
  lastName: string;
}

export interface AdminInviteRequest extends AdminInviteRequestBody {
  invitedByAdmin: AuthenticatedAdmin;
}

export interface AdminInviteResponse {
  message: string;
  inviteId: string;
}

export type AdminInviteStatus = "pending" | "accepted" | "expired" | "revoked";

export interface AdminChangePasswordRequestBody {
  currentPassword: string;
  newPassword: string;
}

export interface AdminChangePasswordRequest extends AdminChangePasswordRequestBody {
  admin: AuthenticatedAdmin;
}

export interface AdminChangePasswordResponse {
  message: string;
}

export interface AuthenticatedAdmin {
  sub: string;
  scope: "admin";
  role: AdminRole;
  username: string;
  emailAddress: string;
  userTypeId: number;
  passwordVersion: number;
}

export interface AdminJwtPayload extends AuthenticatedAdmin {
  iat: number;
  exp: number;
  iss: "brickpine-admin";
  aud: "admin-api";
}

export interface AdminAuthConfig {
  superAdmin: {
    username: string;
    emailAddress: string;
    phoneNumber: string;
    password: string;
    firstName: string;
    lastName: string;
    userTypeId: number;
    createdAt?: string;
    normalizedUsername: string;
    normalizedEmailAddress: string;
    normalizedPhoneNumber: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    issuer: "brickpine-admin";
    audience: "admin-api";
    scope: "admin";
  };
  invite: {
    frontendUrl: string;
    expiryDays: number;
  };
}
