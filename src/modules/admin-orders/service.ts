import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  AdminOrderStatus,
  AdminOrderStatusFilter,
  AdminOrdersListFilters,
  AdminOrdersListResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminOrdersServiceDependencies {
  queryFn?: QueryFunction;
}

interface AdminOrderRow extends QueryResultRow {
  id: number;
  orderNumber: string | null;
  status: number | null;
  buyerUsername: string | null;
  sellerUsername: string | null;
  logisticUsername: string | null;
  vehicleType: string | null;
  deliveryDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TotalCountRow extends QueryResultRow {
  total: number;
}

const ORDER_STATUS_CODE_MAP: Record<AdminOrderStatusFilter, readonly number[]> = {
  pending: [1],
  picked_up: [2],
  in_transit: [3],
  delivered: [8],
  cancelled: [6, 7]
} as const;

export class AdminOrdersValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrdersValidationError";
  }
}

function getQueryFn(dependencies: AdminOrdersServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AdminOrdersValidationError(`${fieldName} must be a positive integer`);
  }

  return value;
}

function normalizeOptionalUsername(value: string | undefined, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new AdminOrdersValidationError(`${fieldName} must be a non-empty string when provided`);
  }

  return normalizedValue;
}

function normalizeOptionalStatus(value: string | undefined): AdminOrderStatusFilter | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = normalizeCredentialValue(value).toLowerCase();

  if (
    normalizedValue !== "pending" &&
    normalizedValue !== "picked_up" &&
    normalizedValue !== "in_transit" &&
    normalizedValue !== "delivered" &&
    normalizedValue !== "cancelled"
  ) {
    throw new AdminOrdersValidationError(
      "status must be one of pending, picked_up, in_transit, delivered, cancelled"
    );
  }

  return normalizedValue as AdminOrderStatusFilter;
}

function mapOrderStatus(code: number | null): AdminOrderStatus {
  if (code === 1) {
    return "pending";
  }

  if (code === 2) {
    return "picked_up";
  }

  if (code === 3) {
    return "in_transit";
  }

  if (code === 8) {
    return "delivered";
  }

  if (code === 6 || code === 7) {
    return "cancelled";
  }

  return "unknown";
}

function mapRequiredText(value: string | null, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Order list returned an invalid ${fieldName} value`);
  }

  return value;
}

function buildOrderFilters(filters: AdminOrdersListFilters): { whereSql: string; params: unknown[] } {
  const clauses = ["1 = 1"];
  const params: unknown[] = [];

  if (typeof filters.status === "string") {
    const statusCodes = ORDER_STATUS_CODE_MAP[filters.status];
    params.push(statusCodes);
    clauses.push(`o.status = ANY($${params.length}::int[])`);
  }

  if (typeof filters.sellerUsername === "string") {
    params.push(filters.sellerUsername);
    clauses.push(`o."sellerUsername" IS NOT NULL`);
    clauses.push(`BTRIM(o."sellerUsername") <> ''`);
    clauses.push(`LOWER(BTRIM(o."sellerUsername")) = LOWER(BTRIM($${params.length}))`);
  }

  if (typeof filters.buyerUsername === "string") {
    params.push(filters.buyerUsername);
    clauses.push(`buyer.username IS NOT NULL`);
    clauses.push(`BTRIM(buyer.username) <> ''`);
    clauses.push(`LOWER(BTRIM(buyer.username)) = LOWER(BTRIM($${params.length}))`);
  }

  if (filters.from instanceof Date) {
    params.push(filters.from);
    clauses.push(`o."createdAt" >= $${params.length}`);
  }

  if (filters.to instanceof Date) {
    params.push(filters.to);
    clauses.push(`o."createdAt" <= $${params.length}`);
  }

  return {
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params
  };
}

export async function listOrders(
  filters: AdminOrdersListFilters,
  dependencies: AdminOrdersServiceDependencies = {}
): Promise<AdminOrdersListResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedFilters: AdminOrdersListFilters = {
    page: normalizePositiveInteger(filters.page, "page"),
    limit: normalizePositiveInteger(filters.limit, "limit"),
    ...(filters.status !== undefined ? { status: normalizeOptionalStatus(filters.status) } : {}),
    ...(filters.sellerUsername !== undefined
      ? {
          sellerUsername: normalizeOptionalUsername(
            filters.sellerUsername,
            "sellerUsername"
          )
        }
      : {}),
    ...(filters.buyerUsername !== undefined
      ? {
          buyerUsername: normalizeOptionalUsername(filters.buyerUsername, "buyerUsername")
        }
      : {}),
    ...(filters.from instanceof Date ? { from: filters.from } : {}),
    ...(filters.to instanceof Date ? { to: filters.to } : {})
  };

  if (
    normalizedFilters.from instanceof Date &&
    normalizedFilters.to instanceof Date &&
    normalizedFilters.from > normalizedFilters.to
  ) {
    throw new AdminOrdersValidationError("from must be less than or equal to to");
  }

  const { whereSql, params } = buildOrderFilters(normalizedFilters);
  const paginationParams = [...params, normalizedFilters.limit, (normalizedFilters.page - 1) * normalizedFilters.limit];

  const ordersResult = await queryFn<AdminOrderRow>(
    [
      "SELECT",
      '  o.id, o."orderNumber", o.status, buyer.username AS "buyerUsername",',
      '  o."sellerUsername", o."logisticUsername", o."vehicleType", o."deliveryDate", o."createdAt", o."updatedAt"',
      "FROM public.order_tb o",
      'LEFT JOIN public."user" buyer ON buyer.id::bigint = o."userId"',
      whereSql,
      'ORDER BY o."createdAt" DESC, o.id DESC',
      `LIMIT $${params.length + 1}`,
      `OFFSET $${params.length + 2}`
    ].join("\n"),
    paginationParams
  );

  const totalResult = await queryFn<TotalCountRow>(
    [
      "SELECT",
      "  COUNT(*)::int AS total",
      "FROM public.order_tb o",
      'LEFT JOIN public."user" buyer ON buyer.id::bigint = o."userId"',
      whereSql
    ].join("\n"),
    params
  );

  return {
    orderDetails: ordersResult.rows.map((order) => ({
      id: Number(order.id),
      orderNumber: mapRequiredText(order.orderNumber, "orderNumber"),
      status: mapOrderStatus(order.status),
      buyerUsername: typeof order.buyerUsername === "string" ? order.buyerUsername : null,
      sellerUsername: typeof order.sellerUsername === "string" ? order.sellerUsername : null,
      logisticUsername: typeof order.logisticUsername === "string" ? order.logisticUsername : null,
      vehicleType: typeof order.vehicleType === "string" ? order.vehicleType : null,
      deliveryDate: order.deliveryDate instanceof Date ? order.deliveryDate.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    })),
    total: Number(totalResult.rows[0]?.total ?? 0)
  };
}
