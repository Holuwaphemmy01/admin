export const PLATFORM_USER_TYPE_IDS = [1, 2, 3] as const;
export const ACTIVE_PLATFORM_USER_STATUS_CODE = 1;
export const SUSPENDED_PLATFORM_USER_STATUS_CODE = 2;
export const PLATFORM_USER_STATUS_CODES = [1, 2] as const;
export const DEFAULT_ADMIN_USERS_PAGE = 1;
export const DEFAULT_ADMIN_USERS_LIMIT = 20;
export const MAX_ADMIN_USERS_LIMIT = 100;

export type PlatformUserTypeId = (typeof PLATFORM_USER_TYPE_IDS)[number];
export type PlatformUserStatusCode = (typeof PLATFORM_USER_STATUS_CODES)[number];

export interface PlatformUserSummary {
  username: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber: string;
  userTypeId: PlatformUserTypeId;
  status: PlatformUserStatusCode;
  createdAt: string;
}

export interface AdminUsersListFilters {
  userTypeId?: PlatformUserTypeId;
  status?: PlatformUserStatusCode;
  page: number;
  limit: number;
  from?: Date;
  to?: Date;
}

export interface AdminUsersListResponse {
  users: PlatformUserSummary[];
  total: number;
}

export interface PlatformUserBioSummary {
  bio: string | null;
  profileImage: string | null;
  coverImage: string | null;
}

export interface PlatformUserSocialPostsSummary {
  total: number;
  latestCreatedAt: null;
}

export interface PlatformUserFollowSummary {
  followers: number;
  following: number;
}

export interface PlatformUserProfileResponse {
  username: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber: string;
  userTypeId: PlatformUserTypeId;
  createdAt: string;
  social_posts: PlatformUserSocialPostsSummary;
  follow: PlatformUserFollowSummary;
  user_bio: PlatformUserBioSummary;
}

export interface SuspendPlatformUserRequestBody {
  status: typeof SUSPENDED_PLATFORM_USER_STATUS_CODE;
  comment: string;
}

export interface SuspendPlatformUserResponse {
  message: string;
}

export interface ActivatePlatformUserRequestBody {
  status: typeof ACTIVE_PLATFORM_USER_STATUS_CODE;
  comment?: string;
}

export interface ActivatePlatformUserResponse {
  message: string;
}
