import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  AdminSubscriptionPlan,
  AdminSubscriptionPlanType,
  AdminSubscriptionsResponse,
  CreateAdminSubscriptionPlanRequestBody,
  CreateAdminSubscriptionPlanResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminSubscriptionsServiceDependencies {
  queryFn?: QueryFunction;
  nowFactory?: () => Date;
}

interface SubscriptionPlanRow extends QueryResultRow {
  id: string | number;
  name: string | null;
  description: string | null;
  price: string | number | null;
  currency: string | null;
  duration: string | number | null;
  maxProduct: string | number | null;
  maxMonthlyOrder: string | number | null;
  maxMonthlyDelivery: string | number | null;
  maxSocialPosts: string | number | null;
  status: string | number | null;
  type: string | null;
}

interface ExistingSubscriptionPlanRow extends QueryResultRow {
  id: string | number;
}

interface CreatedSubscriptionPlanRow extends QueryResultRow {
  id: string | number;
  name: string | null;
  price: string | number | null;
  currency: string | null;
  duration: string | number | null;
  maxProduct: string | number | null;
  maxMonthlyOrder: string | number | null;
  maxMonthlyDelivery: string | number | null;
  description: string | null;
  status: string | number | null;
  type: string | null;
}

type MessageErrorConstructor = new (message: string) => Error;

export class AdminSubscriptionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSubscriptionValidationError";
  }
}

export class AdminSubscriptionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSubscriptionConflictError";
  }
}

function getQueryFn(dependencies: AdminSubscriptionsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getNowFactory(dependencies: AdminSubscriptionsServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function isPostgresErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
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

function normalizePlanType(
  value: AdminSubscriptionPlanType,
  ErrorType: MessageErrorConstructor
): "seller" | "logistic" {
  if (value === "seller") {
    return "seller";
  }

  if (value === "logistics") {
    return "logistic";
  }

  throw new ErrorType("type is required and must be one of seller, logistics");
}

function normalizePrice(value: number, ErrorType: MessageErrorConstructor): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    Math.abs(value - Number(value.toFixed(2))) > Number.EPSILON
  ) {
    throw new ErrorType(
      "price is required and must be a non-negative finite number with at most 2 decimal places"
    );
  }

  return value;
}

function normalizeOptionalNonNegativeInteger(
  value: number | undefined,
  fieldName: string,
  ErrorType: MessageErrorConstructor
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new ErrorType(`${fieldName} must be a non-negative integer when provided`);
  }

  return value;
}

function normalizeFeatures(
  value: string[] | undefined,
  ErrorType: MessageErrorConstructor
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ErrorType("features must be an array of non-empty strings when provided");
  }

  return value.map((feature) => {
    if (typeof feature !== "string") {
      throw new ErrorType("features must be an array of non-empty strings when provided");
    }

    const normalizedFeature = normalizeCredentialValue(feature);

    if (normalizedFeature === "") {
      throw new ErrorType("features must be an array of non-empty strings when provided");
    }

    return normalizedFeature;
  });
}

function mapRequiredPositiveInteger(value: string | number, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error(`Subscription query returned an invalid ${fieldName}`);
  }

  return numericValue;
}

function mapNullableInteger(value: string | number | null, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue)) {
    throw new Error(`Subscription query returned an invalid ${fieldName}`);
  }

  return numericValue;
}

function mapNullableNumber(value: string | number | null, fieldName: string): number | null {
  if (value === null) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Subscription query returned an invalid ${fieldName}`);
  }

  return numericValue;
}

function mapNullableText(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = normalizeCredentialValue(value);

  return normalizedValue === "" ? null : normalizedValue;
}

function mapRequiredText(value: string | null, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`Subscription query returned an invalid ${fieldName}`);
  }

  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new Error(`Subscription query returned an invalid ${fieldName}`);
  }

  return normalizedValue;
}

function mapRequiredType(value: string | null): AdminSubscriptionPlanType {
  if (value === "seller") {
    return "seller";
  }

  if (value === "logistic") {
    return "logistics";
  }

  throw new Error("Subscription query returned an invalid type");
}

function parseFeatures(description: string | null): string[] {
  if (description === null) {
    return [];
  }

  try {
    const parsedDescription = JSON.parse(description);

    if (
      Array.isArray(parsedDescription) &&
      parsedDescription.every((feature) => typeof feature === "string")
    ) {
      return parsedDescription.map((feature) => normalizeCredentialValue(feature));
    }
  } catch {
    return [];
  }

  return [];
}

function mapSubscriptionPlan(row: SubscriptionPlanRow): AdminSubscriptionPlan {
  return {
    id: mapRequiredPositiveInteger(row.id, "id"),
    name: mapNullableText(row.name),
    description: mapNullableText(row.description),
    price: mapNullableNumber(row.price, "price"),
    currency: mapNullableText(row.currency),
    duration: mapNullableInteger(row.duration, "duration"),
    maxProduct: mapNullableInteger(row.maxProduct, "maxProduct"),
    maxMonthlyOrder: mapNullableInteger(row.maxMonthlyOrder, "maxMonthlyOrder"),
    maxMonthlyDelivery: mapNullableInteger(row.maxMonthlyDelivery, "maxMonthlyDelivery"),
    maxSocialPosts: mapNullableInteger(row.maxSocialPosts, "maxSocialPosts"),
    status: mapNullableInteger(row.status, "status")
  };
}

function mapCreatedSubscriptionPlan(
  row: CreatedSubscriptionPlanRow
): CreateAdminSubscriptionPlanResponse["plan"] {
  const type = mapRequiredType(row.type);

  return {
    id: mapRequiredPositiveInteger(row.id, "id"),
    name: mapRequiredText(row.name, "name"),
    type,
    price: mapNullableNumber(row.price, "price") ?? 0,
    currency: mapRequiredText(row.currency, "currency"),
    duration: mapNullableInteger(row.duration, "duration") ?? 0,
    productLimit: mapNullableInteger(row.maxProduct, "maxProduct"),
    monthlyOrderLimit:
      type === "logistics"
        ? mapNullableInteger(row.maxMonthlyDelivery, "maxMonthlyDelivery")
        : mapNullableInteger(row.maxMonthlyOrder, "maxMonthlyOrder"),
    features: parseFeatures(row.description),
    status: mapNullableInteger(row.status, "status") ?? 0
  };
}

export async function listAdminSubscriptions(
  dependencies: AdminSubscriptionsServiceDependencies = {}
): Promise<AdminSubscriptionsResponse> {
  const queryFn = getQueryFn(dependencies);
  const subscriptionResult = await queryFn<SubscriptionPlanRow>(
    [
      "SELECT",
      '  s.id, s.name, s.description, s.price, s.currency, s.duration,',
      '  s."maxProduct" AS "maxProduct",',
      '  s."maxMonthlyOrder" AS "maxMonthlyOrder",',
      '  s."maxMonthlyDelivery" AS "maxMonthlyDelivery",',
      '  s."maxSocialPosts" AS "maxSocialPosts",',
      "  s.status, s.type",
      "FROM public.subscription s",
      "WHERE s.type IN ('seller', 'logistic')",
      "ORDER BY s.type ASC, s.price ASC NULLS LAST, s.duration ASC NULLS LAST, s.id ASC"
    ].join("\n")
  );

  return subscriptionResult.rows.reduce<AdminSubscriptionsResponse>(
    (groupedSubscriptions, subscriptionRow) => {
      const mappedSubscription = mapSubscriptionPlan(subscriptionRow);

      if (subscriptionRow.type === "seller") {
        groupedSubscriptions.seller.push(mappedSubscription);
      } else if (subscriptionRow.type === "logistic") {
        groupedSubscriptions.logistics.push(mappedSubscription);
      }

      return groupedSubscriptions;
    },
    {
      seller: [],
      logistics: []
    }
  );
}

export async function createAdminSubscriptionPlan(
  payload: CreateAdminSubscriptionPlanRequestBody,
  dependencies: AdminSubscriptionsServiceDependencies = {}
): Promise<CreateAdminSubscriptionPlanResponse> {
  const queryFn = getQueryFn(dependencies);
  const now = getNowFactory(dependencies)();
  const name = normalizeRequiredTextField(
    payload.name,
    "name",
    AdminSubscriptionValidationError
  );
  const dbType = normalizePlanType(payload.type, AdminSubscriptionValidationError);
  const price = normalizePrice(payload.price, AdminSubscriptionValidationError);
  const productLimit = normalizeOptionalNonNegativeInteger(
    payload.productLimit,
    "productLimit",
    AdminSubscriptionValidationError
  );
  const monthlyOrderLimit = normalizeOptionalNonNegativeInteger(
    payload.monthlyOrderLimit,
    "monthlyOrderLimit",
    AdminSubscriptionValidationError
  );
  const features = normalizeFeatures(payload.features, AdminSubscriptionValidationError);
  const duration = 12;
  const currency = "NGN";
  const status = 1;
  const duplicatePlanResult = await queryFn<ExistingSubscriptionPlanRow>(
    [
      "SELECT s.id",
      "FROM public.subscription s",
      "WHERE LOWER(BTRIM(s.name)) = LOWER(BTRIM($1))",
      "  AND s.type = $2",
      "  AND s.duration = $3",
      "  AND COALESCE(s.status, 1) = 1",
      "LIMIT 1"
    ].join("\n"),
    [name, dbType, duration]
  );

  if ((duplicatePlanResult.rowCount ?? 0) > 0) {
    throw new AdminSubscriptionConflictError(
      "An active annual subscription plan with this name and type already exists"
    );
  }

  const description = features === undefined ? null : JSON.stringify(features);
  const maxMonthlyOrder = dbType === "seller" ? monthlyOrderLimit ?? null : null;
  const maxMonthlyDelivery = dbType === "logistic" ? monthlyOrderLimit ?? null : null;

  try {
    const createdPlanResult = await queryFn<CreatedSubscriptionPlanRow>(
      [
        "INSERT INTO public.subscription (",
        '  name, description, price, currency, duration, "maxProduct", "maxMonthlyOrder",',
        '  "maxMonthlyDelivery", status, type, "createdAt", "updatedAt"',
        ")",
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)",
        'RETURNING id, name, description, price, currency, duration, "maxProduct" AS "maxProduct",',
        '  "maxMonthlyOrder" AS "maxMonthlyOrder", "maxMonthlyDelivery" AS "maxMonthlyDelivery",',
        "  status, type"
      ].join("\n"),
      [
        name,
        description,
        price,
        currency,
        duration,
        productLimit ?? null,
        maxMonthlyOrder,
        maxMonthlyDelivery,
        status,
        dbType,
        now
      ]
    );
    const createdPlan = createdPlanResult.rows[0];

    if (!createdPlan) {
      throw new Error("Subscription plan insert did not return a row");
    }

    return {
      message: "Subscription plan created successfully",
      plan: mapCreatedSubscriptionPlan(createdPlan)
    };
  } catch (error) {
    if (isPostgresErrorWithCode(error, "23505")) {
      throw new AdminSubscriptionConflictError(
        "An active annual subscription plan with this name and type already exists"
      );
    }

    throw error;
  }
}
