export const ADMIN_ANALYTICS_OVERVIEW_PERIODS = [
  "daily",
  "weekly",
  "monthly",
  "all_time"
] as const;

export const DEFAULT_ADMIN_ANALYTICS_OVERVIEW_PERIOD = "all_time";

export type AdminAnalyticsOverviewPeriod =
  (typeof ADMIN_ANALYTICS_OVERVIEW_PERIODS)[number];

export interface AdminAnalyticsOverviewResponse {
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
  activeStores: number;
  activeLogistics: number;
  pendingKyc: number;
  openTickets: number;
}
