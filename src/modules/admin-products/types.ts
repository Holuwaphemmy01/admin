export interface ProductCategorySummary {
  id: number;
  name: string;
  basicCommissionVat: number;
  standardCommissionVat: number;
  premiumCommissionVat: number;
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
