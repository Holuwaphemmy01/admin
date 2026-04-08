import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  CreateProductCategoryRequestBody,
  CreateProductCategoryResponse
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

interface CreatedProductCategoryRow extends QueryResultRow {
  id: number;
  name: string | null;
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

function mapNumericValue(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Inserted product category returned an invalid ${fieldName} value`);
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
          '  id, name, "basicCommissionVat", "standardCommissionVat", "premiumCommissionVat"'
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
