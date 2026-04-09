import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import { AdminSubscriptionPlan, AdminSubscriptionsResponse } from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminSubscriptionsServiceDependencies {
  queryFn?: QueryFunction;
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

function getQueryFn(dependencies: AdminSubscriptionsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
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
