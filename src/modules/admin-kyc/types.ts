export const PENDING_KYC_TYPES = [
  "individual_seller",
  "registered_company",
  "individual_logistic",
  "registered_logistic"
] as const;

export const DEFAULT_PENDING_KYC_PAGE = 1;
export const DEFAULT_PENDING_KYC_LIMIT = 20;
export const MAX_PENDING_KYC_LIMIT = 100;
export const PENDING_KYC_STATUS = "pending";

export type PendingKycType = (typeof PENDING_KYC_TYPES)[number];
export type PendingKycStatus = typeof PENDING_KYC_STATUS;

export interface PendingKycSubmission {
  username: string;
  kycType: PendingKycType;
  status: PendingKycStatus;
  submittedAt: string;
}

export interface PendingKycListFilters {
  type?: PendingKycType;
  page: number;
  limit: number;
}

export interface PendingKycListResponse {
  submissions: PendingKycSubmission[];
  total: number;
}
