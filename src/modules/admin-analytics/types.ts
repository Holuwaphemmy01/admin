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

export type AdminAnalyticsOverviewPeriod =
  (typeof ADMIN_ANALYTICS_OVERVIEW_PERIODS)[number];
export type AdminAnalyticsRevenueGroupBy =
  (typeof ADMIN_ANALYTICS_REVENUE_GROUP_BY_VALUES)[number];

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
