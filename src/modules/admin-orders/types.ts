export const ADMIN_ORDER_STATUS_FILTERS = [
  "pending",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled"
] as const;

export const DEFAULT_ADMIN_ORDERS_PAGE = 1;
export const DEFAULT_ADMIN_ORDERS_LIMIT = 20;
export const MAX_ADMIN_ORDERS_LIMIT = 100;

export type AdminOrderStatusFilter = (typeof ADMIN_ORDER_STATUS_FILTERS)[number];
export type AdminOrderStatus =
  | AdminOrderStatusFilter
  | "unknown";

export interface AdminOrdersListFilters {
  status?: AdminOrderStatusFilter;
  sellerUsername?: string;
  buyerUsername?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export interface AdminOrderSummary {
  id: number;
  orderNumber: string;
  status: AdminOrderStatus;
  buyerUsername: string | null;
  sellerUsername: string | null;
  logisticUsername: string | null;
  vehicleType: string | null;
  deliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrdersListResponse {
  orderDetails: AdminOrderSummary[];
  total: number;
}
