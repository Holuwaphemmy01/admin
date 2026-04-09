export const DEFAULT_ADMIN_CAMPAIGNS_PAGE = 1;
export const DEFAULT_ADMIN_CAMPAIGNS_LIMIT = 20;
export const MAX_ADMIN_CAMPAIGNS_LIMIT = 100;

export const ADMIN_CAMPAIGN_STATUS_FILTERS = [
  "draft",
  "pending_approval",
  "active",
  "paused",
  "completed",
  "rejected"
] as const;

export type AdminCampaignStatusFilter = (typeof ADMIN_CAMPAIGN_STATUS_FILTERS)[number];

export interface AdminCampaignsListFilters {
  status?: AdminCampaignStatusFilter;
  username?: string;
  page: number;
  limit: number;
}

export interface AdminCampaignItem {
  campaignId: string;
  username: string;
  goal: string;
  status: string;
  budget: number;
  startDate: string | null;
  endDate: string | null;
}

export interface AdminCampaignsListResponse {
  campaigns: AdminCampaignItem[];
  total: number;
}

export interface AdminCampaignDetailsResponse {
  campaignId: string;
  username: string;
  goal: string;
  status: string;
  budget: number;
  impressions: number;
  clicks: number;
  conversions: number;
  postId: string;
  createdAt: string;
}

export interface ApproveAdminCampaignRequestBody {
  note?: string;
}

export interface ApproveAdminCampaignResponse {
  message: string;
}

export interface PauseAdminCampaignRequestBody {
  reason?: string;
}

export interface PauseAdminCampaignResponse {
  message: string;
}

export interface RejectAdminCampaignRequestBody {
  reason: string;
  actedByAdminUserId: string;
}

export interface RejectAdminCampaignResponse {
  message: string;
}
