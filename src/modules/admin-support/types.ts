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

export interface AdminSupportCategoryItem {
  id: number;
  name: string;
  description: string;
}

export interface CreateAdminSupportCategoryRequest {
  name: string;
  description: string;
}

export interface CreateAdminSupportCategoryResponse {
  tickets: AdminSupportCategoryItem[];
}

export interface AdminSupportTicketMessageItem {
  id: number;
  message: string;
  attachment: string | null;
  attachmentFileType: string | null;
  reply: boolean;
  createdAt: string;
}

export interface AdminSupportTicketDetails {
  id: number;
  username: string;
  subject: string;
  messages: AdminSupportTicketMessageItem[];
  status: AdminSupportTicketStatusFilter;
  createdAt: string;
}

export interface AdminSupportTicketDetailsResponse {
  ticket: AdminSupportTicketDetails;
}

export interface AdminSupportTicketReplySignedParams {
  url: string;
  fields: Record<string, string>;
}

export interface ReplyToAdminSupportTicketRequest {
  ticketId: number;
  message: string;
  attachmentFileType?: string;
}

export interface ReplyToAdminSupportTicketResponse {
  signedParams: AdminSupportTicketReplySignedParams | null;
}

export interface CloseAdminSupportTicketRequest {
  ticketId: number;
  resolution?: string;
}

export interface CloseAdminSupportTicketResponse {
  message: string;
}
