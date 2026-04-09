export interface AdminSubscriptionPlan {
  id: number;
  name: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  duration: number | null;
  maxProduct: number | null;
  maxMonthlyOrder: number | null;
  maxMonthlyDelivery: number | null;
  maxSocialPosts: number | null;
  status: number | null;
}

export interface AdminSubscriptionsResponse {
  seller: AdminSubscriptionPlan[];
  logistics: AdminSubscriptionPlan[];
}

export type AdminSubscriptionPlanType = "seller" | "logistics";

export interface CreateAdminSubscriptionPlanRequestBody {
  name: string;
  type: AdminSubscriptionPlanType;
  price: number;
  productLimit?: number;
  monthlyOrderLimit?: number;
  features?: string[];
}

export interface UpdateAdminSubscriptionPlanRequestBody {
  id: number;
  name?: string;
  price?: number;
  productLimit?: number;
  monthlyOrderLimit?: number;
  features?: string[];
}

export interface DeleteAdminSubscriptionPlanRequestBody {
  id: number;
}

export interface CreatedAdminSubscriptionPlan {
  id: number;
  name: string;
  type: AdminSubscriptionPlanType;
  price: number;
  currency: string;
  duration: number;
  productLimit: number | null;
  monthlyOrderLimit: number | null;
  features: string[];
  status: number;
}

export interface CreateAdminSubscriptionPlanResponse {
  message: string;
  plan: CreatedAdminSubscriptionPlan;
}

export interface UpdateAdminSubscriptionPlanResponse {
  message: string;
  plan: CreatedAdminSubscriptionPlan;
}

export interface DeleteAdminSubscriptionPlanResponse {
  message: string;
}
