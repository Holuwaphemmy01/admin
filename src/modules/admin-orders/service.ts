import { randomUUID } from "node:crypto";

import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  CancelAdminOrdersInput,
  CancelAdminOrdersResponse,
  AdminOrderDetailsResponse,
  AdminOrderItemDetails,
  AdminOrderLogisticsDetails,
  AdminOrderPartyDetails,
  AdminOrdersStatsPeriod,
  AdminOrdersStatsResponse,
  AdminOrderStatus,
  AdminOrderStatusFilter,
  AdminOrdersListFilters,
  AdminOrdersListResponse,
  DEFAULT_ADMIN_ORDERS_STATS_PERIOD
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

interface AdminOrdersServiceDependencies {
  queryFn?: QueryFunction;
  runInTransaction?: RunInTransaction;
  nowFactory?: () => Date;
  uuidFactory?: () => string;
}

type NumericLike = number | string | null;

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

interface AdminOrdersStatsRow extends QueryResultRow {
  totalOrders: number;
  completed: number;
  cancelled: number;
  pending: number;
}

interface AdminOrdersTrendRow extends QueryResultRow {
  date: Date;
  totalOrders: number;
}

interface AdminOrderDetailsRow extends QueryResultRow {
  id: number;
  orderNumber: string | null;
  status: number | null;
  cartId: NumericLike;
  sellerUsernameRaw: string | null;
  logisticsUsernameRaw: string | null;
  orderVehicleType: string | null;
  deliveryStatus: string | null;
  buyerUsername: string | null;
  buyerFirstName: string | null;
  buyerLastName: string | null;
  buyerEmailAddress: string | null;
  buyerPhoneNumber: string | null;
  sellerUsernameResolved: string | null;
  sellerFirstName: string | null;
  sellerLastName: string | null;
  sellerEmailAddress: string | null;
  sellerPhoneNumber: string | null;
  logisticsUsernameResolved: string | null;
  logisticsFirstName: string | null;
  logisticsLastName: string | null;
  logisticsEmailAddress: string | null;
  logisticsPhoneNumber: string | null;
  logisticsVehicleType: string | null;
  createdAt: Date;
}

interface AdminOrderItemRow extends QueryResultRow {
  cartId: NumericLike;
  productId: NumericLike;
  productName: string | null;
  quantity: NumericLike;
  unitPrice: NumericLike;
  amount: NumericLike;
  currency: string | null;
  imageUrl: string | null;
  sku: string | null;
}

interface AdminOrderCancellationRow extends QueryResultRow {
  id: number;
  orderNumber: string | null;
  status: number | null;
  deliveryId: NumericLike;
  deliveryStatus: string | null;
}

const ORDER_STATUS_CODE_MAP: Record<AdminOrderStatusFilter, readonly number[]> = {
  pending: [1],
  picked_up: [2],
  in_transit: [3],
  delivered: [8],
  cancelled: [6, 7]
} as const;

const ADMIN_FORCE_CANCELLED_ORDER_STATUS = 6;

export class AdminOrdersValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrdersValidationError";
  }
}

export class AdminOrderNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderNotFoundError";
  }
}

export class AdminOrderConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderConflictError";
  }
}

export class AdminOrderStatsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderStatsValidationError";
  }
}

function getQueryFn(dependencies: AdminOrdersServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getRunInTransaction(
  dependencies: AdminOrdersServiceDependencies = {}
): RunInTransaction {
  return dependencies.runInTransaction ?? withTransaction;
}

function getNowFactory(dependencies: AdminOrdersServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function getUuidFactory(dependencies: AdminOrdersServiceDependencies = {}): () => string {
  return dependencies.uuidFactory ?? randomUUID;
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

function normalizeStatsPeriod(value: string | undefined): AdminOrdersStatsPeriod {
  if (value === undefined) {
    return DEFAULT_ADMIN_ORDERS_STATS_PERIOD;
  }

  const normalizedValue = normalizeCredentialValue(value).toLowerCase();

  if (
    normalizedValue !== "daily" &&
    normalizedValue !== "weekly" &&
    normalizedValue !== "monthly"
  ) {
    throw new AdminOrderStatsValidationError("period must be one of daily, weekly, monthly");
  }

  return normalizedValue;
}

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new AdminOrdersValidationError(`${fieldName} must be a non-empty string`);
  }

  return normalizedValue;
}

function normalizeRequiredOrderIds(value: number[]): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AdminOrdersValidationError("orderIds must be a non-empty array of positive integers");
  }

  const normalizedIds = value.map((orderId) => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new AdminOrdersValidationError(
        "orderIds must be a non-empty array of positive integers"
      );
    }

    return orderId;
  });

  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new AdminOrdersValidationError("orderIds must not contain duplicate values");
  }

  return normalizedIds;
}

function normalizeOptionalReason(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new AdminOrdersValidationError("reason must be a non-empty string when provided");
  }

  return normalizedValue;
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

function mapOptionalText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function mapRequiredDate(value: Date, fieldName: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Order detail query returned an invalid ${fieldName} value`);
  }

  return value.toISOString();
}

function mapNullableNumber(value: NumericLike): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue;
}

function mapRequiredInteger(value: NumericLike, fieldName: string): number {
  const numericValue = mapNullableNumber(value);

  if (numericValue === null || !Number.isInteger(numericValue)) {
    throw new Error(`Order detail query returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapOrderPartyDetails(input: {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailAddress?: string | null;
  phoneNumber?: string | null;
}): AdminOrderPartyDetails {
  return {
    username: mapOptionalText(input.username),
    firstName: mapOptionalText(input.firstName),
    lastName: mapOptionalText(input.lastName),
    emailAddress: mapOptionalText(input.emailAddress),
    phoneNumber: mapOptionalText(input.phoneNumber)
  };
}

function mapOrderLogisticsDetails(input: {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailAddress?: string | null;
  phoneNumber?: string | null;
  vehicleType?: string | null;
  deliveryStatus?: string | null;
}): AdminOrderLogisticsDetails {
  return {
    ...mapOrderPartyDetails(input),
    vehicleType: mapOptionalText(input.vehicleType),
    deliveryStatus: mapOptionalText(input.deliveryStatus)
  };
}

function mapCountValue(value: number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function buildOrderTrendQuery(period: AdminOrdersStatsPeriod): string {
  switch (period) {
    case "daily":
      return [
        "WITH series AS (",
        "  SELECT generate_series(",
        "    date_trunc('day', $1::timestamptz) - INTERVAL '6 days',",
        "    date_trunc('day', $1::timestamptz),",
        "    INTERVAL '1 day'",
        '  ) AS "date"',
        "), order_counts AS (",
        "  SELECT",
        '    date_trunc(\'day\', o."createdAt") AS "date",',
        '    COUNT(*)::int AS "totalOrders"',
        "  FROM public.order_tb o",
        "  WHERE o.\"createdAt\" >= date_trunc('day', $1::timestamptz) - INTERVAL '6 days'",
        "    AND o.\"createdAt\" < date_trunc('day', $1::timestamptz) + INTERVAL '1 day'",
        '  GROUP BY "date"',
        ")",
        "SELECT",
        '  series."date",',
        '  COALESCE(order_counts."totalOrders", 0)::int AS "totalOrders"',
        "FROM series",
        'LEFT JOIN order_counts ON order_counts."date" = series."date"',
        'ORDER BY series."date" ASC'
      ].join("\n");
    case "weekly":
      return [
        "WITH series AS (",
        "  SELECT generate_series(",
        "    date_trunc('week', $1::timestamptz) - INTERVAL '7 weeks',",
        "    date_trunc('week', $1::timestamptz),",
        "    INTERVAL '1 week'",
        '  ) AS "date"',
        "), order_counts AS (",
        "  SELECT",
        '    date_trunc(\'week\', o."createdAt") AS "date",',
        '    COUNT(*)::int AS "totalOrders"',
        "  FROM public.order_tb o",
        "  WHERE o.\"createdAt\" >= date_trunc('week', $1::timestamptz) - INTERVAL '7 weeks'",
        "    AND o.\"createdAt\" < date_trunc('week', $1::timestamptz) + INTERVAL '1 week'",
        '  GROUP BY "date"',
        ")",
        "SELECT",
        '  series."date",',
        '  COALESCE(order_counts."totalOrders", 0)::int AS "totalOrders"',
        "FROM series",
        'LEFT JOIN order_counts ON order_counts."date" = series."date"',
        'ORDER BY series."date" ASC'
      ].join("\n");
    case "monthly":
    default:
      return [
        "WITH series AS (",
        "  SELECT generate_series(",
        "    date_trunc('month', $1::timestamptz) - INTERVAL '11 months',",
        "    date_trunc('month', $1::timestamptz),",
        "    INTERVAL '1 month'",
        '  ) AS "date"',
        "), order_counts AS (",
        "  SELECT",
        '    date_trunc(\'month\', o."createdAt") AS "date",',
        '    COUNT(*)::int AS "totalOrders"',
        "  FROM public.order_tb o",
        "  WHERE o.\"createdAt\" >= date_trunc('month', $1::timestamptz) - INTERVAL '11 months'",
        "    AND o.\"createdAt\" < date_trunc('month', $1::timestamptz) + INTERVAL '1 month'",
        '  GROUP BY "date"',
        ")",
        "SELECT",
        '  series."date",',
        '  COALESCE(order_counts."totalOrders", 0)::int AS "totalOrders"',
        "FROM series",
        'LEFT JOIN order_counts ON order_counts."date" = series."date"',
        'ORDER BY series."date" ASC'
      ].join("\n");
  }
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

export async function getOrderDetails(
  orderNumber: string,
  dependencies: AdminOrdersServiceDependencies = {}
): Promise<AdminOrderDetailsResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedOrderNumber = normalizeRequiredString(orderNumber, "orderNumber");

  const orderResult = await queryFn<AdminOrderDetailsRow>(
    [
      "SELECT",
      '  o.id, o."orderNumber", o.status, o."cartId",',
      '  o."sellerUsername" AS "sellerUsernameRaw",',
      '  o."logisticUsername" AS "logisticsUsernameRaw",',
      '  o."vehicleType" AS "orderVehicleType",',
      '  d.status::text AS "deliveryStatus",',
      '  buyer.username AS "buyerUsername", buyer."firstName" AS "buyerFirstName",',
      '  buyer."lastName" AS "buyerLastName", buyer."emailAddress" AS "buyerEmailAddress",',
      '  buyer."phoneNumber" AS "buyerPhoneNumber",',
      '  seller.username AS "sellerUsernameResolved", seller."firstName" AS "sellerFirstName",',
      '  seller."lastName" AS "sellerLastName", seller."emailAddress" AS "sellerEmailAddress",',
      '  seller."phoneNumber" AS "sellerPhoneNumber",',
      '  logistics_user.username AS "logisticsUsernameResolved",',
      '  logistics_user."firstName" AS "logisticsFirstName",',
      '  logistics_user."lastName" AS "logisticsLastName",',
      '  logistics_user."emailAddress" AS "logisticsEmailAddress",',
      '  logistics_user."phoneNumber" AS "logisticsPhoneNumber",',
      '  l."vehicleType"::text AS "logisticsVehicleType",',
      '  o."createdAt"',
      "FROM public.order_tb o",
      'LEFT JOIN public."user" buyer ON buyer.id::bigint = o."userId"',
      'LEFT JOIN public."user" seller ON seller.username IS NOT NULL',
      '  AND LOWER(BTRIM(seller.username)) = LOWER(BTRIM(o."sellerUsername"))',
      'LEFT JOIN public."user" logistics_user ON logistics_user.username IS NOT NULL',
      '  AND LOWER(BTRIM(logistics_user.username)) = LOWER(BTRIM(o."logisticUsername"))',
      'LEFT JOIN public.logistic l ON l."userId" = logistics_user.id',
      'LEFT JOIN public.delivery d ON d.id = o."deliveryId"',
      'WHERE BTRIM(o."orderNumber") = BTRIM($1)',
      "LIMIT 1"
    ].join("\n"),
    [normalizedOrderNumber]
  );

  const order = orderResult.rows[0];

  if (!order) {
    throw new AdminOrderNotFoundError("Order not found");
  }

  const orderId = mapRequiredInteger(order.id, "id");
  const cartId = mapNullableNumber(order.cartId);

  const itemsResult = await queryFn<AdminOrderItemRow>(
    [
      "SELECT",
      '  c.id AS "cartId", c."productId", p.name AS "productName", c.quantity,',
      '  c."unitPrice", c.amount, p.currency, p.img AS "imageUrl", p.sku',
      "FROM public.cart c",
      'LEFT JOIN public.product p ON p.id::bigint = c."productId"',
      "WHERE",
      '  ($1::bigint IS NOT NULL AND c.id::bigint = $1)',
      '  OR c."orderTbId" = $2',
      "ORDER BY c.id ASC"
    ].join("\n"),
    [cartId, orderId]
  );

  const items: AdminOrderItemDetails[] = itemsResult.rows.map((item) => {
    const quantity = mapRequiredInteger(item.quantity, "quantity");
    const unitPrice = mapNullableNumber(item.unitPrice);
    const amount = mapNullableNumber(item.amount);

    return {
      cartId: mapRequiredInteger(item.cartId, "cartId"),
      productId: mapNullableNumber(item.productId),
      productName: mapOptionalText(item.productName),
      quantity,
      unitPrice,
      amount,
      currency: mapOptionalText(item.currency),
      imageUrl: mapOptionalText(item.imageUrl),
      sku: mapOptionalText(item.sku)
    };
  });

  const totalAmount = items.reduce((sum, item) => {
    if (typeof item.amount === "number") {
      return sum + item.amount;
    }

    if (typeof item.unitPrice === "number") {
      return sum + item.unitPrice * item.quantity;
    }

    return sum;
  }, 0);

  return {
    orderStatus: {
      orderNumber: mapRequiredText(order.orderNumber, "orderNumber"),
      status: mapOrderStatus(order.status),
      buyer: mapOrderPartyDetails({
        username: order.buyerUsername,
        firstName: order.buyerFirstName,
        lastName: order.buyerLastName,
        emailAddress: order.buyerEmailAddress,
        phoneNumber: order.buyerPhoneNumber
      }),
      seller: mapOrderPartyDetails({
        username: order.sellerUsernameResolved ?? order.sellerUsernameRaw,
        firstName: order.sellerFirstName,
        lastName: order.sellerLastName,
        emailAddress: order.sellerEmailAddress,
        phoneNumber: order.sellerPhoneNumber
      }),
      logistics: mapOrderLogisticsDetails({
        username: order.logisticsUsernameResolved ?? order.logisticsUsernameRaw,
        firstName: order.logisticsFirstName,
        lastName: order.logisticsLastName,
        emailAddress: order.logisticsEmailAddress,
        phoneNumber: order.logisticsPhoneNumber,
        vehicleType: order.logisticsVehicleType ?? order.orderVehicleType,
        deliveryStatus: order.deliveryStatus
      }),
      items,
      totalAmount: Number(totalAmount.toFixed(2)),
      createdAt: mapRequiredDate(order.createdAt, "createdAt")
    }
  };
}

export async function getOrderStats(
  period: string | undefined,
  dependencies: AdminOrdersServiceDependencies = {}
): Promise<AdminOrdersStatsResponse> {
  const normalizedPeriod = normalizeStatsPeriod(period);
  const queryFn = getQueryFn(dependencies);
  const now = getNowFactory(dependencies)();

  const statsResult = await queryFn<AdminOrdersStatsRow>(
    [
      "SELECT",
      "  COUNT(*)::int AS \"totalOrders\",",
      "  COUNT(*) FILTER (WHERE o.status = 8)::int AS completed,",
      "  COUNT(*) FILTER (WHERE o.status IN (6, 7))::int AS cancelled,",
      "  COUNT(*) FILTER (WHERE o.status = 1)::int AS pending",
      "FROM public.order_tb o"
    ].join("\n")
  );

  const trendResult = await queryFn<AdminOrdersTrendRow>(
    buildOrderTrendQuery(normalizedPeriod),
    [now]
  );

  const totals = statsResult.rows[0];
  const totalOrders = mapCountValue(totals?.totalOrders);
  const completed = mapCountValue(totals?.completed);
  const cancelled = mapCountValue(totals?.cancelled);
  const pending = mapCountValue(totals?.pending);
  const completionRate =
    totalOrders === 0 ? 0 : Number(((completed / totalOrders) * 100).toFixed(2));

  return {
    totalOrders,
    completed,
    cancelled,
    pending,
    completionRate,
    trend: trendResult.rows.map((point) => ({
      date: point.date.toISOString().slice(0, 10),
      totalOrders: mapCountValue(point.totalOrders)
    }))
  };
}

export async function cancelOrdersByAdmin(
  input: CancelAdminOrdersInput,
  dependencies: AdminOrdersServiceDependencies = {}
): Promise<CancelAdminOrdersResponse> {
  const normalizedOrderNumber = normalizeRequiredString(input.orderNumber, "orderNumber");
  const normalizedOrderIds = normalizeRequiredOrderIds(input.orderIds);
  const normalizedReason = normalizeOptionalReason(input.reason);
  const normalizedAdminUserId = normalizeRequiredString(input.actedByAdminUserId, "actedByAdminUserId");
  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const uuidFactory = getUuidFactory(dependencies);

  return runInTransaction(async (client) => {
    const existingOrderNumberResult = await client.query<AdminOrderCancellationRow>(
      [
        "SELECT",
        '  o.id, o."orderNumber", o.status, o."deliveryId", d.status::text AS "deliveryStatus"',
        "FROM public.order_tb o",
        'LEFT JOIN public.delivery d ON d.id = o."deliveryId"',
        'WHERE BTRIM(o."orderNumber") = BTRIM($1)',
        "FOR UPDATE"
      ].join("\n"),
      [normalizedOrderNumber]
    );

    if ((existingOrderNumberResult.rowCount ?? 0) === 0) {
      throw new AdminOrderNotFoundError("Order not found");
    }

    const matchedOrders = existingOrderNumberResult.rows.filter((order) =>
      normalizedOrderIds.includes(mapRequiredInteger(order.id, "id"))
    );

    if (matchedOrders.length !== normalizedOrderIds.length) {
      throw new AdminOrdersValidationError(
        "orderIds must reference existing orders for this orderNumber"
      );
    }

    if (
      matchedOrders.some(
        (order) => order.status === 6 || order.status === 7
      )
    ) {
      throw new AdminOrderConflictError("One or more selected orders are already cancelled");
    }

    if (matchedOrders.some((order) => order.status === 8)) {
      throw new AdminOrderConflictError("Delivered orders cannot be cancelled");
    }

    if (matchedOrders.some((order) => mapOptionalText(order.deliveryStatus) === "completed")) {
      throw new AdminOrderConflictError("Orders with completed deliveries cannot be cancelled");
    }

    const timestamp = nowFactory();
    const deliveryIds = matchedOrders
      .map((order) => mapNullableNumber(order.deliveryId))
      .filter((deliveryId): deliveryId is number => Number.isInteger(deliveryId));

    await client.query(
      [
        "UPDATE public.order_tb",
        "SET",
        "  status = $1,",
        '  "updatedAt" = $2',
        "WHERE id = ANY($3::int[])"
      ].join("\n"),
      [ADMIN_FORCE_CANCELLED_ORDER_STATUS, timestamp, normalizedOrderIds]
    );

    if (deliveryIds.length > 0) {
      await client.query(
        [
          "UPDATE public.delivery",
          "SET",
          "  status = 'cancelled',",
          '  "failureReason" = COALESCE($1, "failureReason"),',
          '  "cancelledAt" = COALESCE("cancelledAt", $2),',
          '  "updatedAt" = $2',
          "WHERE id = ANY($3::int[])"
        ].join("\n"),
        [normalizedReason ?? null, timestamp, deliveryIds]
      );
    }

    for (const order of matchedOrders) {
      await client.query(
        [
          "INSERT INTO public.admin_order_action_audit_logs (",
          '  id, "targetOrderId", "actedByAdminUserId", action,',
          '  "previousStatus", "nextStatus", "orderNumber", reason, "createdAt"',
          ") VALUES (",
          "  $1, $2, $3, $4, $5, $6, $7, $8, $9",
          ")"
        ].join("\n"),
        [
          uuidFactory(),
          mapRequiredInteger(order.id, "id"),
          normalizedAdminUserId,
          "force_cancel",
          mapRequiredInteger(order.status, "status"),
          ADMIN_FORCE_CANCELLED_ORDER_STATUS,
          mapRequiredText(order.orderNumber, "orderNumber"),
          normalizedReason ?? null,
          timestamp
        ]
      );
    }

    return {
      message: "Order cancelled"
    };
  });
}
