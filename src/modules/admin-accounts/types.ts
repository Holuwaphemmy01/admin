import { AdminRole, AdminStatus } from "../admin/types";
import { AuthenticatedAdmin } from "../admin-auth/types";

export interface AdminAccountSummary {
  id: string;
  username: string;
  role: AdminRole;
  status: AdminStatus;
  createdAt: string;
}

export interface AdminAccountListResponse {
  admins: AdminAccountSummary[];
}

export interface AdminRevokeRequestBody {
  reason?: string;
}

export interface AdminRevokeRequest extends AdminRevokeRequestBody {
  targetAdminId: string;
  revokedByAdmin: AuthenticatedAdmin;
}

export interface AdminRevokeResponse {
  message: string;
}
