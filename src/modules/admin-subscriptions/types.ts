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
