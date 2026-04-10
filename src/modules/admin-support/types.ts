export const DEFAULT_ADMIN_SUPPORT_TICKETS_PAGE = 1;
export const DEFAULT_ADMIN_SUPPORT_TICKETS_LIMIT = 20;
export const MAX_ADMIN_SUPPORT_TICKETS_LIMIT = 100;

export const ADMIN_SUPPORT_TICKET_STATUSES = ["open", "closed", "pending"] as const;

export type AdminSupportTicketStatusFilter =
  (typeof ADMIN_SUPPORT_TICKET_STATUSES)[number];

export interface AdminSupportTicketsListFilters {
  status?: AdminSupportTicketStatusFilter;
  username?: string;
  categoryId?: number;
  page: number;
  limit: number;
}

export interface AdminSupportTicketItem {
  id: number;
  username: string;
  subject: string;
  status: AdminSupportTicketStatusFilter;
  createdAt: string;
}

export interface AdminSupportTicketsListResponse {
  tickets: AdminSupportTicketItem[];
  total: number;
}
