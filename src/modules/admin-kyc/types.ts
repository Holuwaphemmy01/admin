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
export const APPROVED_KYC_STATUS = "approved";
export const REJECTED_KYC_STATUS = "rejected";

export type PendingKycType = (typeof PENDING_KYC_TYPES)[number];
export type PendingKycStatus =
  | typeof PENDING_KYC_STATUS
  | typeof APPROVED_KYC_STATUS
  | typeof REJECTED_KYC_STATUS;

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

export type KycFormFieldValue = string | number | boolean | null;

export interface KycFormStep {
  step: number;
  section: string;
  fields: Record<string, KycFormFieldValue>;
}

export interface UserKycSubmissionResponse {
  username: string;
  kycType: PendingKycType;
  status: PendingKycStatus;
  forms: KycFormStep[];
  submittedAt: string;
}

export interface ApproveUserKycResponse {
  message: string;
  username: string;
}

export interface RejectUserKycResponse {
  message: string;
  username: string;
}
