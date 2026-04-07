import { AdminRole, AdminStatus } from "../admin/types";

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
