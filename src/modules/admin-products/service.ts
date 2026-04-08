import { randomUUID } from "node:crypto";

import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  AdminProductComputedStatus,
  AdminProductsListFilters,
  AdminProductsListResponse,
  CreateProductCategoryRequestBody,
  CreateProductCategoryResponse,
  DeleteProductCategoryResponse,
  ModerateProductRequestBody,
  ModerateProductResponse,
  ProductModerationAction,
  AdminProductStatusFilter,
  UpdateProductCategoryRequestBody,
  UpdateProductCategoryResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface TransactionClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

type RunInTransaction = <T>(operation: (client: TransactionClient) => Promise<T>) => Promise<T>;

interface AdminProductsServiceDependencies {
  queryFn?: QueryFunction;
  runInTransaction?: RunInTransaction;
  nowFactory?: () => Date;
}

interface ExistingProductCategoryRow extends QueryResultRow {
  id: number;
}

interface ProductCategoryDeleteUsageRow extends QueryResultRow {
  productCount: string | number;
  productCategoryCommissionCount: string | number;
}

interface ProductModerationRow extends QueryResultRow {
  id: number;
  showProduct: boolean | null;
  policyAction: ProductModerationAction | null;
  removedByPolicy: boolean | null;
}

interface ProductListRow extends QueryResultRow {
  id: number;
  name: string | null;
  sellerUsername: string | null;
  categoryId: string | number | null;
  categoryName: string | null;
  price: string | number | null;
  currency: string | null;
  quantity: string | number | null;
  showProduct: boolean | null;
  policyAction: ProductModerationAction | null;
  removedByPolicy: boolean | null;
  createdAt: Date;
}

interface TotalCountRow extends QueryResultRow {
  total: number;
}

interface CreatedProductCategoryRow extends QueryResultRow {
  id: number;
  name: string | null;
  description: string | null;
  basicCommissionVat: string | number | null;
  standardCommissionVat: string | number | null;
  premiumCommissionVat: string | number | null;
}

interface ProductCategoryForUpdateRow extends QueryResultRow {
  id: number;
  name: string | null;
  description: string | null;
  basicCommissionVat: string | number | null;
  standardCommissionVat: string | number | null;
  premiumCommissionVat: string | number | null;
}

type MessageErrorConstructor = new (message: string) => Error;

export class ProductCategoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductCategoryValidationError";
  }
}

export class ProductCategoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductCategoryConflictError";
  }
}

export class ProductCategoryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductCategoryNotFoundError";
  }
}

export class ProductModerationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductModerationValidationError";
  }
}

export class ProductModerationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductModerationConflictError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductNotFoundError";
  }
}

export class ProductListValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductListValidationError";
  }
}

function getQueryFn(dependencies: AdminProductsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getRunInTransaction(
  dependencies: AdminProductsServiceDependencies = {}
): RunInTransaction {
  if (dependencies.runInTransaction) {
    return dependencies.runInTransaction;
  }

  const queryFn = getQueryFn(dependencies);

  if (queryFn !== query) {
    return async <T>(operation: (client: TransactionClient) => Promise<T>) =>
      operation({
        query: queryFn
      });
  }

  return withTransaction;
}

function getNowFactory(dependencies: AdminProductsServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function normalizeRequiredTextField(
  value: string,
  fieldName: string,
  ErrorType: MessageErrorConstructor
): string {
  if (typeof value !== "string") {
    throw new ErrorType(`${fieldName} is required and must be a non-empty string`);
  }

  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new ErrorType(`${fieldName} is required and must be a non-empty string`);
  }

  return normalizedValue;
}

function normalizePercentageValue(
  value: number,
  fieldName: string,
  ErrorType: MessageErrorConstructor
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ErrorType(`${fieldName} must be a finite number between 0 and 100`);
  }

  return value;
}

function normalizeOptionalTextField(
  value: string | undefined,
  fieldName: string,
  ErrorType: MessageErrorConstructor
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeRequiredTextField(value, fieldName, ErrorType);
}

function normalizeOptionalPercentageValue(
  value: number | undefined,
  fieldName: string,
  ErrorType: MessageErrorConstructor
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizePercentageValue(value, fieldName, ErrorType);
}

function normalizeCategoryId(value: number, ErrorType: MessageErrorConstructor): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ErrorType("id must be a positive integer");
  }

  return value;
}

function mapNumericValue(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Inserted product category returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapNullableNumber(value: string | number | null, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Product list returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapNullableInteger(value: string | number | null, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error(`Product list returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function normalizeProductModerationAction(
  value: ProductModerationAction,
  ErrorType: MessageErrorConstructor
): ProductModerationAction {
  if (value !== "flag" && value !== "remove") {
    throw new ErrorType("action must be either 'flag' or 'remove'");
  }

  return value;
}

function normalizeProductListStatus(
  value: string | undefined,
  ErrorType: MessageErrorConstructor
): AdminProductStatusFilter | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = normalizeCredentialValue(value).toLowerCase();

  if (
    normalizedValue !== "active" &&
    normalizedValue !== "flagged" &&
    normalizedValue !== "out_of_stock"
  ) {
    throw new ErrorType("status must be one of active, flagged, out_of_stock");
  }

  return normalizedValue as AdminProductStatusFilter;
}

function mapNullableNumericValue(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error("Updated product category returned an invalid numeric commission VAT value");
  }

  return numericValue;
}

function mapCountValue(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error(`Product category delete returned an invalid ${fieldName} count`);
  }

  return numericValue;
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "23505"
  );
}

function mapProductCategoryDetails(
  row: ProductCategoryForUpdateRow,
  fallbackName?: string
): UpdateProductCategoryResponse["productCategory"] {
  const name =
    typeof row.name === "string" && row.name.trim() !== ""
      ? row.name
      : (fallbackName ?? "");

  return {
    id: Number(row.id),
    name,
    description: typeof row.description === "string" ? row.description : null,
    basicCommissionVat: mapNullableNumericValue(row.basicCommissionVat),
    standardCommissionVat: mapNullableNumericValue(row.standardCommissionVat),
    premiumCommissionVat: mapNullableNumericValue(row.premiumCommissionVat)
  };
}

function buildAdminProductListFilters(
  filters: AdminProductsListFilters
): { whereSql: string; params: unknown[] } {
  const clauses = ["1 = 1"];
  const params: unknown[] = [];

  if (typeof filters.username === "string") {
    params.push(filters.username);
    clauses.push(`u.username IS NOT NULL`);
    clauses.push(`BTRIM(u.username) <> ''`);
    clauses.push(`LOWER(BTRIM(u.username)) = LOWER(BTRIM($${params.length}))`);
  }

  if (typeof filters.categoryId === "number") {
    params.push(filters.categoryId);
    clauses.push(`p."productCategoryId" = $${params.length}`);
  }

  if (filters.status === "active") {
    clauses.push(`COALESCE(p."removedByPolicy", false) = false`);
    clauses.push(`COALESCE(p."policyAction", '') NOT IN ('flag', 'remove')`);
    clauses.push(`(p.quantity IS NULL OR p.quantity > 0)`);
  } else if (filters.status === "flagged") {
    clauses.push(`p."policyAction" = 'flag'`);
    clauses.push(`COALESCE(p."removedByPolicy", false) = false`);
  } else if (filters.status === "out_of_stock") {
    clauses.push(`COALESCE(p."removedByPolicy", false) = false`);
    clauses.push(`COALESCE(p."policyAction", '') NOT IN ('flag', 'remove')`);
    clauses.push(`p.quantity IS NOT NULL`);
    clauses.push(`p.quantity <= 0`);
  }

  return {
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params
  };
}

function mapAdminProductStatus(row: ProductListRow): AdminProductComputedStatus {
  if (row.removedByPolicy === true || row.policyAction === "remove") {
    return "removed";
  }

  if (row.policyAction === "flag") {
    return "flagged";
  }

  const quantity = mapNullableNumber(row.quantity, "quantity");

  if (quantity !== null && quantity <= 0) {
    return "out_of_stock";
  }

  return "active";
}

export async function listProducts(
  filters: AdminProductsListFilters,
  dependencies: AdminProductsServiceDependencies = {}
): Promise<AdminProductsListResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedFilters: AdminProductsListFilters = {
    page: normalizeCategoryId(filters.page, ProductListValidationError),
    limit: normalizeCategoryId(filters.limit, ProductListValidationError),
    ...(filters.username !== undefined
      ? {
          username: normalizeRequiredTextField(
            filters.username,
            "username",
            ProductListValidationError
          )
        }
      : {}),
    ...(filters.categoryId !== undefined
      ? {
          categoryId: normalizeCategoryId(filters.categoryId, ProductListValidationError)
        }
      : {}),
    ...(filters.status !== undefined
      ? {
          status: normalizeProductListStatus(filters.status, ProductListValidationError)
        }
      : {})
  };

  const { whereSql, params } = buildAdminProductListFilters(normalizedFilters);
  const paginationParams = [
    ...params,
    normalizedFilters.limit,
    (normalizedFilters.page - 1) * normalizedFilters.limit
  ];

  const productsResult = await queryFn<ProductListRow>(
    [
      "SELECT",
      '  p.id, p.name, p.price, p.currency, p.quantity, p."showProduct", p."policyAction",',
      '  p."removedByPolicy", p."createdAt", u.username AS "sellerUsername",',
      '  p."productCategoryId" AS "categoryId", pc.name AS "categoryName"',
      "FROM public.product p",
      'LEFT JOIN public."user" u ON u.id = p."userId"',
      'LEFT JOIN public.product_category pc ON pc.id = p."productCategoryId"',
      whereSql,
      'ORDER BY p."createdAt" DESC, p.id DESC',
      `LIMIT $${params.length + 1}`,
      `OFFSET $${params.length + 2}`
    ].join("\n"),
    paginationParams
  );

  const totalResult = await queryFn<TotalCountRow>(
    [
      "SELECT",
      "  COUNT(*)::int AS total",
      "FROM public.product p",
      'LEFT JOIN public."user" u ON u.id = p."userId"',
      'LEFT JOIN public.product_category pc ON pc.id = p."productCategoryId"',
      whereSql
    ].join("\n"),
    params
  );

  return {
    products: productsResult.rows.map((product) => ({
      id: Number(product.id),
      name: typeof product.name === "string" ? product.name : null,
      sellerUsername:
        typeof product.sellerUsername === "string" ? product.sellerUsername : null,
      categoryId: mapNullableInteger(product.categoryId, "categoryId"),
      categoryName: typeof product.categoryName === "string" ? product.categoryName : null,
      price: mapNullableNumber(product.price, "price"),
      currency: typeof product.currency === "string" ? product.currency : null,
      quantity: mapNullableNumber(product.quantity, "quantity"),
      status: mapAdminProductStatus(product),
      createdAt: product.createdAt.toISOString()
    })),
    total: Number(totalResult.rows[0]?.total ?? 0)
  };
}

export async function createProductCategory(
  input: CreateProductCategoryRequestBody,
  dependencies: AdminProductsServiceDependencies = {}
): Promise<CreateProductCategoryResponse> {
  const normalizedName = normalizeRequiredTextField(
    input.name,
    "name",
    ProductCategoryValidationError
  );
  const normalizedDescription = normalizeRequiredTextField(
    input.description,
    "description",
    ProductCategoryValidationError
  );
  const basicCommissionVat = normalizePercentageValue(
    input.basicCommissionVat,
    "basicCommissionVat",
    ProductCategoryValidationError
  );
  const standardCommissionVat = normalizePercentageValue(
    input.standardCommissionVat,
    "standardCommissionVat",
    ProductCategoryValidationError
  );
  const premiumCommissionVat = normalizePercentageValue(
    input.premiumCommissionVat,
    "premiumCommissionVat",
    ProductCategoryValidationError
  );

  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);

  return runInTransaction(async (client) => {
    const existingCategoryResult = await client.query<ExistingProductCategoryRow>(
      [
        "SELECT",
        "  pc.id",
        "FROM public.product_category pc",
        "WHERE pc.name IS NOT NULL",
        "  AND BTRIM(pc.name) <> ''",
        "  AND LOWER(BTRIM(pc.name)) = LOWER(BTRIM($1))",
        "LIMIT 1"
      ].join("\n"),
      [normalizedName]
    );

    if ((existingCategoryResult.rowCount ?? 0) > 0) {
      throw new ProductCategoryConflictError("A product category with this name already exists");
    }

    const timestamp = nowFactory();

    try {
      const createdCategoryResult = await client.query<CreatedProductCategoryRow>(
        [
          "INSERT INTO public.product_category (",
          '  name, description, "basicCommissionVat", "standardCommissionVat", "premiumCommissionVat",',
          '  status, "createdAt", "updatedAt"',
          ") VALUES (",
          "  $1, $2, $3, $4, $5, $6, $7, $8",
          ")",
          "RETURNING",
          '  id, name, description, "basicCommissionVat", "standardCommissionVat", "premiumCommissionVat"'
        ].join("\n"),
        [
          normalizedName,
          normalizedDescription,
          basicCommissionVat,
          standardCommissionVat,
          premiumCommissionVat,
          1,
          timestamp,
          timestamp
        ]
      );

      const createdCategory = createdCategoryResult.rows[0];

      if (!createdCategory) {
        throw new Error("Product category insert did not return a created row");
      }

      return {
        message: "Category created successfully",
        productCategory: {
          id: Number(createdCategory.id),
          name:
            typeof createdCategory.name === "string" && createdCategory.name.trim() !== ""
              ? createdCategory.name
              : normalizedName,
          basicCommissionVat: mapNumericValue(
            createdCategory.basicCommissionVat,
            "basicCommissionVat"
          ),
          standardCommissionVat: mapNumericValue(
            createdCategory.standardCommissionVat,
            "standardCommissionVat"
          ),
          premiumCommissionVat: mapNumericValue(
            createdCategory.premiumCommissionVat,
            "premiumCommissionVat"
          )
        }
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductCategoryConflictError("A product category with this name already exists");
      }

      throw error;
    }
  });
}

interface UpdateProductCategoryInput extends UpdateProductCategoryRequestBody {
  id: number;
}

export async function updateProductCategory(
  input: UpdateProductCategoryInput,
  dependencies: AdminProductsServiceDependencies = {}
): Promise<UpdateProductCategoryResponse> {
  const categoryId = normalizeCategoryId(input.id, ProductCategoryValidationError);
  const normalizedName = normalizeOptionalTextField(
    input.name,
    "name",
    ProductCategoryValidationError
  );
  const normalizedDescription = normalizeOptionalTextField(
    input.description,
    "description",
    ProductCategoryValidationError
  );
  const basicCommissionVat = normalizeOptionalPercentageValue(
    input.basicCommissionVat,
    "basicCommissionVat",
    ProductCategoryValidationError
  );
  const standardCommissionVat = normalizeOptionalPercentageValue(
    input.standardCommissionVat,
    "standardCommissionVat",
    ProductCategoryValidationError
  );
  const premiumCommissionVat = normalizeOptionalPercentageValue(
    input.premiumCommissionVat,
    "premiumCommissionVat",
    ProductCategoryValidationError
  );

  if (
    normalizedName === undefined &&
    normalizedDescription === undefined &&
    basicCommissionVat === undefined &&
    standardCommissionVat === undefined &&
    premiumCommissionVat === undefined
  ) {
    throw new ProductCategoryValidationError(
      "At least one category field must be provided for update"
    );
  }

  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);

  return runInTransaction(async (client) => {
    const currentCategoryResult = await client.query<ProductCategoryForUpdateRow>(
      [
        "SELECT",
        '  pc.id, pc.name, pc.description, pc."basicCommissionVat", pc."standardCommissionVat", pc."premiumCommissionVat"',
        "FROM public.product_category pc",
        "WHERE pc.id = $1",
        "FOR UPDATE"
      ].join("\n"),
      [categoryId]
    );

    const currentCategory = currentCategoryResult.rows[0];

    if (!currentCategory) {
      throw new ProductCategoryNotFoundError("Product category not found");
    }

    if (normalizedName !== undefined) {
      const existingCategoryResult = await client.query<ExistingProductCategoryRow>(
        [
          "SELECT",
          "  pc.id",
          "FROM public.product_category pc",
          "WHERE pc.name IS NOT NULL",
          "  AND BTRIM(pc.name) <> ''",
          "  AND LOWER(BTRIM(pc.name)) = LOWER(BTRIM($1))",
          "  AND pc.id <> $2",
          "LIMIT 1"
        ].join("\n"),
        [normalizedName, categoryId]
      );

      if ((existingCategoryResult.rowCount ?? 0) > 0) {
        throw new ProductCategoryConflictError("A product category with this name already exists");
      }
    }

    const nextName =
      normalizedName ??
      (typeof currentCategory.name === "string" ? currentCategory.name : "");
    const nextDescription =
      normalizedDescription ??
      (typeof currentCategory.description === "string" ? currentCategory.description : null);
    const nextBasicCommissionVat =
      basicCommissionVat !== undefined ? basicCommissionVat : currentCategory.basicCommissionVat;
    const nextStandardCommissionVat =
      standardCommissionVat !== undefined
        ? standardCommissionVat
        : currentCategory.standardCommissionVat;
    const nextPremiumCommissionVat =
      premiumCommissionVat !== undefined
        ? premiumCommissionVat
        : currentCategory.premiumCommissionVat;
    const timestamp = nowFactory();

    try {
      const updatedCategoryResult = await client.query<ProductCategoryForUpdateRow>(
        [
          "UPDATE public.product_category",
          "SET name = $1,",
          "    description = $2,",
          '    "basicCommissionVat" = $3,',
          '    "standardCommissionVat" = $4,',
          '    "premiumCommissionVat" = $5,',
          '    "updatedAt" = $6',
          "WHERE id = $7",
          "RETURNING",
          '  id, name, description, "basicCommissionVat", "standardCommissionVat", "premiumCommissionVat"'
        ].join("\n"),
        [
          nextName,
          nextDescription,
          nextBasicCommissionVat,
          nextStandardCommissionVat,
          nextPremiumCommissionVat,
          timestamp,
          categoryId
        ]
      );

      const updatedCategory = updatedCategoryResult.rows[0];

      if (!updatedCategory) {
        throw new Error("Product category update did not return an updated row");
      }

      return {
        message: "Category updated successfully",
        productCategory: mapProductCategoryDetails(updatedCategory, nextName)
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProductCategoryConflictError("A product category with this name already exists");
      }

      throw error;
    }
  });
}

interface DeleteProductCategoryInput {
  id: number;
}

export async function deleteProductCategory(
  input: DeleteProductCategoryInput,
  dependencies: AdminProductsServiceDependencies = {}
): Promise<DeleteProductCategoryResponse> {
  const categoryId = normalizeCategoryId(input.id, ProductCategoryValidationError);
  const runInTransaction = getRunInTransaction(dependencies);

  return runInTransaction(async (client) => {
    const currentCategoryResult = await client.query<ExistingProductCategoryRow>(
      [
        "SELECT",
        "  pc.id",
        "FROM public.product_category pc",
        "WHERE pc.id = $1",
        "FOR UPDATE"
      ].join("\n"),
      [categoryId]
    );

    const currentCategory = currentCategoryResult.rows[0];

    if (!currentCategory) {
      throw new ProductCategoryNotFoundError("Product category not found");
    }

    const usageResult = await client.query<ProductCategoryDeleteUsageRow>(
      [
        "SELECT",
        '  (SELECT COUNT(*) FROM public.product p WHERE p."productCategoryId" = $1) AS "productCount",',
        '  (SELECT COUNT(*) FROM public.product_category_commission pcc WHERE pcc."productCategoryId" = $1) AS "productCategoryCommissionCount"'
      ].join("\n"),
      [categoryId]
    );

    const usageRow = usageResult.rows[0];

    if (!usageRow) {
      throw new Error("Product category delete usage check did not return a row");
    }

    const productCount = mapCountValue(usageRow.productCount, "product");
    const productCategoryCommissionCount = mapCountValue(
      usageRow.productCategoryCommissionCount,
      "productCategoryCommission"
    );

    if (productCount > 0 || productCategoryCommissionCount > 0) {
      throw new ProductCategoryConflictError(
        "Product category cannot be deleted while linked products or category commissions exist"
      );
    }

    const deletedCategoryResult = await client.query<ExistingProductCategoryRow>(
      [
        "DELETE FROM public.product_category",
        "WHERE id = $1",
        "RETURNING id"
      ].join("\n"),
      [categoryId]
    );

    const deletedCategory = deletedCategoryResult.rows[0];

    if (!deletedCategory) {
      throw new Error("Product category delete did not return a deleted row");
    }

    return {
      message: "Category deleted successfully"
    };
  });
}

interface ModerateProductInput extends ModerateProductRequestBody {
  productId: number;
  actedByAdminUserId: string;
}

export async function moderateProduct(
  input: ModerateProductInput,
  dependencies: AdminProductsServiceDependencies = {}
): Promise<ModerateProductResponse> {
  const productId = normalizeCategoryId(input.productId, ProductModerationValidationError);
  const reason = normalizeRequiredTextField(
    input.reason,
    "reason",
    ProductModerationValidationError
  );
  const action = normalizeProductModerationAction(
    input.action,
    ProductModerationValidationError
  );
  const actedByAdminUserId = normalizeRequiredTextField(
    input.actedByAdminUserId,
    "actedByAdminUserId",
    ProductModerationValidationError
  );
  const nowFactory = getNowFactory(dependencies);
  const runInTransaction = getRunInTransaction(dependencies);

  return runInTransaction(async (client) => {
    const currentProductResult = await client.query<ProductModerationRow>(
      [
        "SELECT",
        '  p.id, p."showProduct", p."policyAction", p."removedByPolicy"',
        "FROM public.product p",
        "WHERE p.id = $1",
        "FOR UPDATE"
      ].join("\n"),
      [productId]
    );

    const currentProduct = currentProductResult.rows[0];

    if (!currentProduct) {
      throw new ProductNotFoundError("Product not found");
    }

    const isCurrentlyRemoved =
      currentProduct.removedByPolicy === true || currentProduct.showProduct === false;

    if (action === "flag" && currentProduct.policyAction === "flag" && !isCurrentlyRemoved) {
      throw new ProductModerationConflictError("Product is already flagged");
    }

    if (action === "remove" && isCurrentlyRemoved) {
      throw new ProductModerationConflictError("Product is already removed");
    }

    if (action === "flag" && currentProduct.policyAction === "remove") {
      throw new ProductModerationConflictError(
        "Product has already been removed and cannot be flagged"
      );
    }

    const timestamp = nowFactory();
    const nextShowProduct = action === "remove" ? false : (currentProduct.showProduct ?? true);
    const nextRemovedByPolicy = action === "remove";

    const updatedProductResult = await client.query<ProductModerationRow>(
      [
        "UPDATE public.product",
        'SET "policyAction" = $1,',
        '    "policyReason" = $2,',
        '    "policyActionAt" = $3,',
        '    "policyUpdatedByAdminUserId" = $4,',
        '    "removedByPolicy" = $5,',
        '    "showProduct" = $6,',
        '    "updatedAt" = $7',
        "WHERE id = $8",
        "RETURNING id"
      ].join("\n"),
      [
        action,
        reason,
        timestamp,
        actedByAdminUserId,
        nextRemovedByPolicy,
        nextShowProduct,
        timestamp,
        productId
      ]
    );

    if (!updatedProductResult.rows[0]) {
      throw new Error("Product moderation update did not return an updated row");
    }

    await client.query(
      [
        "INSERT INTO public.product_policy_action_audit_logs (",
        '  id, "targetProductId", "actedByAdminUserId", action, reason,',
        '  "previousPolicyAction", "previousShowProduct", "nextShowProduct", "createdAt"',
        ") VALUES (",
        "  $1, $2, $3, $4, $5, $6, $7, $8, $9",
        ")"
      ].join("\n"),
      [
        randomUUID(),
        productId,
        actedByAdminUserId,
        action,
        reason,
        currentProduct.policyAction,
        currentProduct.showProduct ?? true,
        nextShowProduct,
        timestamp
      ]
    );

    return {
      message:
        action === "flag" ? "Product flagged successfully" : "Product removed successfully",
      productId
    };
  });
}
