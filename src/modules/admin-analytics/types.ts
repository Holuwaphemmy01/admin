export const ADMIN_ANALYTICS_OVERVIEW_PERIODS = [
  "daily",
  "weekly",
  "monthly",
  "all_time"
] as const;

export const DEFAULT_ADMIN_ANALYTICS_OVERVIEW_PERIOD = "all_time";
export const ADMIN_ANALYTICS_REVENUE_GROUP_BY_VALUES = [
  "category",
  "tier",
  "period"
] as const;
export const DEFAULT_ADMIN_ANALYTICS_REVENUE_GROUP_BY = "period";
export const ADMIN_ANALYTICS_TOP_SELLERS_PERIODS = [
  "daily",
  "weekly",
  "monthly"
] as const;
export const DEFAULT_ADMIN_ANALYTICS_TOP_SELLERS_PERIOD = "monthly";
export const DEFAULT_ADMIN_ANALYTICS_TOP_SELLERS_LIMIT = 10;
export const MAX_ADMIN_ANALYTICS_TOP_SELLERS_LIMIT = 100;
export const ADMIN_ANALYTICS_TOP_PRODUCTS_PERIODS = [
  "daily",
  "weekly",
  "monthly"
] as const;
export const DEFAULT_ADMIN_ANALYTICS_TOP_PRODUCTS_PERIOD = "monthly";
export const DEFAULT_ADMIN_ANALYTICS_TOP_PRODUCTS_LIMIT = 10;
export const MAX_ADMIN_ANALYTICS_TOP_PRODUCTS_LIMIT = 100;

export type AdminAnalyticsOverviewPeriod =
  (typeof ADMIN_ANALYTICS_OVERVIEW_PERIODS)[number];
export type AdminAnalyticsRevenueGroupBy =
  (typeof ADMIN_ANALYTICS_REVENUE_GROUP_BY_VALUES)[number];
export type AdminAnalyticsTopSellersPeriod =
  (typeof ADMIN_ANALYTICS_TOP_SELLERS_PERIODS)[number];
export type AdminAnalyticsTopProductsPeriod =
  (typeof ADMIN_ANALYTICS_TOP_PRODUCTS_PERIODS)[number];

export interface AdminAnalyticsOverviewResponse {
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
  activeStores: number;
  activeLogistics: number;
  pendingKyc: number;
  openTickets: number;
}

export interface AdminAnalyticsRevenueFilters {
  groupBy?: AdminAnalyticsRevenueGroupBy;
  from?: Date;
  to?: Date;
}

export interface AdminAnalyticsRevenueBreakdownByCategoryItem {
  category: string;
  revenue: number;
}

export interface AdminAnalyticsRevenueBreakdownByTierItem {
  tier: string;
  revenue: number;
}

export interface AdminAnalyticsRevenueBreakdownByPeriodItem {
  period: string;
  revenue: number;
}

export type AdminAnalyticsRevenueBreakdownItem =
  | AdminAnalyticsRevenueBreakdownByCategoryItem
  | AdminAnalyticsRevenueBreakdownByTierItem
  | AdminAnalyticsRevenueBreakdownByPeriodItem;

export interface AdminAnalyticsRevenueResponse {
  totalRevenue: number;
  subscriptionRevenue: number;
  commissionRevenue: number;
  adRevenue: number;
  breakdown: AdminAnalyticsRevenueBreakdownItem[];
}

export interface AdminAnalyticsTopSellersFilters {
  limit?: number;
  period?: AdminAnalyticsTopSellersPeriod;
}

export interface AdminAnalyticsTopSellerItem {
  username: string;
  totalOrders: number;
  totalRevenue: number;
  rating: number;
}

export interface AdminAnalyticsTopSellersResponse {
  sellers: AdminAnalyticsTopSellerItem[];
}

export interface AdminAnalyticsTopProductsFilters {
  limit?: number;
  categoryId?: number;
  period?: AdminAnalyticsTopProductsPeriod;
}

export interface AdminAnalyticsTopProductItem {
  productId: number;
  name: string;
  totalSold: number;
  revenue: number;
  seller: string;
}

export interface AdminAnalyticsTopProductsResponse {
  products: AdminAnalyticsTopProductItem[];
}
