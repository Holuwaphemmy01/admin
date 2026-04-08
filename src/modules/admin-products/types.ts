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
