export const DEFAULT_ADMIN_SETTLEMENTS_PAGE = 1;
export const DEFAULT_ADMIN_SETTLEMENTS_LIMIT = 20;
export const MAX_ADMIN_SETTLEMENTS_LIMIT = 100;
export const ADMIN_SETTLEMENT_STATUSES = ["pending", "approved", "rejected"] as const;

export type AdminSettlementStatus = (typeof ADMIN_SETTLEMENT_STATUSES)[number];

export interface AdminSettlementsListFilters {
  status?: AdminSettlementStatus;
  username?: string;
  page: number;
  limit: number;
}

export interface AdminSettlementItem {
  id: number;
  username: string;
  amount: number;
  status: AdminSettlementStatus;
  description: string | null;
  createdAt: string;
  settlementAccountId: number | null;
}

export interface AdminSettlementsListResponse {
  settlements: AdminSettlementItem[];
  total: number;
}

export interface AdminSettlementsStatsResponse {
  totalPending: number;
  totalApproved: number;
  totalRejected: number;
  pendingAmount: number;
  approvedAmount: number;
}

export interface AdminApproveSettlementRequestBody {
  username: string;
  amount: number;
  description: string;
  settlementAccountId: number;
}

export interface AdminApproveSettlementResponse {
  message: string;
}

export interface AdminRejectSettlementRequestBody {
  reason: string;
}

export interface AdminRejectSettlementResponse {
  message: string;
}
