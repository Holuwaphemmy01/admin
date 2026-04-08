export interface ProductCategorySummary {
  id: number;
  name: string;
  basicCommissionVat: number;
  standardCommissionVat: number;
  premiumCommissionVat: number;
}

export interface ProductCategoryDetails {
  id: number;
  name: string;
  description: string | null;
  basicCommissionVat: number | null;
  standardCommissionVat: number | null;
  premiumCommissionVat: number | null;
}

export interface CreateProductCategoryRequestBody {
  name: string;
  description: string;
  basicCommissionVat: number;
  standardCommissionVat: number;
  premiumCommissionVat: number;
}

export interface CreateProductCategoryResponse {
  message: string;
  productCategory: ProductCategorySummary;
}

export interface UpdateProductCategoryRequestBody {
  name?: string;
  description?: string;
  basicCommissionVat?: number;
  standardCommissionVat?: number;
  premiumCommissionVat?: number;
}

export interface UpdateProductCategoryResponse {
  message: string;
  productCategory: ProductCategoryDetails;
}

export interface DeleteProductCategoryResponse {
  message: string;
}

export type ProductModerationAction = "flag" | "remove";

export interface ModerateProductRequestBody {
  reason: string;
  action: ProductModerationAction;
}

export interface ModerateProductResponse {
  message: string;
  productId: number;
}

export type AdminProductStatusFilter = "active" | "flagged" | "out_of_stock";
export type AdminProductComputedStatus = AdminProductStatusFilter | "removed";

export interface AdminProductsListFilters {
  username?: string;
  categoryId?: number;
  status?: AdminProductStatusFilter;
  page: number;
  limit: number;
}

export interface AdminProductSummary {
  id: number;
  name: string | null;
  sellerUsername: string | null;
  categoryId: number | null;
  categoryName: string | null;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  status: AdminProductComputedStatus;
  createdAt: string;
}

export interface AdminProductsListResponse {
  products: AdminProductSummary[];
  total: number;
}
