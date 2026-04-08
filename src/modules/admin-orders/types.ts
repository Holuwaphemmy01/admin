export const ADMIN_ORDER_STATUS_FILTERS = [
  "pending",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled"
] as const;
export const ADMIN_ORDER_STATS_PERIODS = ["daily", "weekly", "monthly"] as const;

export const DEFAULT_ADMIN_ORDERS_PAGE = 1;
export const DEFAULT_ADMIN_ORDERS_LIMIT = 20;
export const MAX_ADMIN_ORDERS_LIMIT = 100;
export const DEFAULT_ADMIN_ORDERS_STATS_PERIOD = "monthly";

export type AdminOrderStatusFilter = (typeof ADMIN_ORDER_STATUS_FILTERS)[number];
export type AdminOrderStatus =
  | AdminOrderStatusFilter
  | "unknown";
export type AdminOrdersStatsPeriod = (typeof ADMIN_ORDER_STATS_PERIODS)[number];

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

export interface AdminOrderPartyDetails {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
}

export interface AdminOrderLogisticsDetails extends AdminOrderPartyDetails {
  vehicleType: string | null;
  deliveryStatus: string | null;
}

export interface AdminOrderItemDetails {
  cartId: number;
  productId: number | null;
  productName: string | null;
  quantity: number;
  unitPrice: number | null;
  amount: number | null;
  currency: string | null;
  imageUrl: string | null;
  sku: string | null;
}

export interface AdminOrderDetails {
  orderNumber: string;
  status: AdminOrderStatus;
  buyer: AdminOrderPartyDetails;
  seller: AdminOrderPartyDetails;
  logistics: AdminOrderLogisticsDetails;
  items: AdminOrderItemDetails[];
  totalAmount: number;
  createdAt: string;
}

export interface AdminOrderDetailsResponse {
  orderStatus: AdminOrderDetails;
}

export interface CancelAdminOrdersRequestBody {
  orderIds: number[];
  reason?: string;
}

export interface CancelAdminOrdersInput extends CancelAdminOrdersRequestBody {
  orderNumber: string;
  actedByAdminUserId: string;
}

export interface CancelAdminOrdersResponse {
  message: string;
}

export interface AdminOrderVolumeTrendPoint {
  date: string;
  totalOrders: number;
}

export interface AdminOrdersStatsResponse {
  totalOrders: number;
  completed: number;
  cancelled: number;
  pending: number;
  completionRate: number;
  trend: AdminOrderVolumeTrendPoint[];
}
