import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import {
  AdminSettlementStatus,
  AdminSettlementsListFilters,
  AdminSettlementsListResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminSettlementsServiceDependencies {
  queryFn?: QueryFunction;
}

interface AdminSettlementRow extends QueryResultRow {
  id: string | number;
  username: string | null;
  amount: string | number | null;
  status: string | number | null;
  description: string | null;
  createdAt: Date;
  settlementAccountId: string | number | null;
}

interface TotalCountRow extends QueryResultRow {
  total: number;
}

export class AdminSettlementsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSettlementsValidationError";
  }
}

function getQueryFn(dependencies: AdminSettlementsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AdminSettlementsValidationError(`${fieldName} must be a positive integer`);
  }

  return value;
}

function normalizeOptionalSettlementStatus(
  value: string | undefined
): AdminSettlementStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "pending" && value !== "approved" && value !== "rejected") {
    throw new AdminSettlementsValidationError(
      "status must be one of pending, approved, or rejected"
    );
  }

  return value;
}

function mapRequiredInteger(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error(`Admin settlements query returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapOptionalInteger(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function mapNumberOrZero(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return numericValue;
}

function mapOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? null : trimmedValue;
}

function mapRequiredDate(value: Date, fieldName: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Admin settlements query returned an invalid ${fieldName} value`);
  }

  return value.toISOString();
}

function mapSettlementStatus(value: string | number | null | undefined): AdminSettlementStatus {
  const numericValue =
    value === null || value === undefined
      ? null
      : typeof value === "number"
        ? value
        : Number(value);

  if (numericValue === 2) {
    return "approved";
  }

  if (numericValue === 3) {
    return "rejected";
  }

  return "pending";
}

function mapSettlementStatusToDbValue(status: AdminSettlementStatus): number {
  if (status === "approved") {
    return 2;
  }

  if (status === "rejected") {
    return 3;
  }

  return 1;
}

function buildSettlementFilters(filters: AdminSettlementsListFilters): {
  whereSql: string;
  params: unknown[];
} {
  const clauses = ['s.status IN (1, 2, 3)', 'u.username IS NOT NULL', "BTRIM(u.username) <> ''"];
  const params: unknown[] = [];

  if (typeof filters.status === "string") {
    params.push(mapSettlementStatusToDbValue(filters.status));
    clauses.push(`s.status = $${params.length}`);
  }

  if (typeof filters.username === "string") {
    params.push(filters.username);
    clauses.push(`LOWER(BTRIM(u.username)) = LOWER(BTRIM($${params.length}))`);
  }

  return {
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params
  };
}

export async function listAdminSettlements(
  filters: AdminSettlementsListFilters,
  dependencies: AdminSettlementsServiceDependencies = {}
): Promise<AdminSettlementsListResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedFilters: AdminSettlementsListFilters = {
    page: normalizePositiveInteger(filters.page, "page"),
    limit: normalizePositiveInteger(filters.limit, "limit"),
    ...(typeof filters.status === "string"
      ? { status: normalizeOptionalSettlementStatus(filters.status) }
      : {}),
    ...(typeof filters.username === "string" ? { username: filters.username.trim() } : {})
  };

  const { whereSql, params } = buildSettlementFilters(normalizedFilters);
  const paginationParams = [
    ...params,
    normalizedFilters.limit,
    (normalizedFilters.page - 1) * normalizedFilters.limit
  ];

  const settlementsResult = await queryFn<AdminSettlementRow>(
    [
      "SELECT",
      '  s.id, u.username, s.amount, s.status, s.description, s."createdAt", s."settlementAccountId"',
      "FROM public.settlement s",
      'INNER JOIN public."user" u ON u.id = s."userId"',
      whereSql,
      'ORDER BY s."createdAt" DESC, s.id DESC',
      `LIMIT $${params.length + 1}`,
      `OFFSET $${params.length + 2}`
    ].join("\n"),
    paginationParams
  );

  const totalResult = await queryFn<TotalCountRow>(
    [
      "SELECT",
      "  COUNT(*)::int AS total",
      "FROM public.settlement s",
      'INNER JOIN public."user" u ON u.id = s."userId"',
      whereSql
    ].join("\n"),
    params
  );

  return {
    settlements: settlementsResult.rows.map((settlement) => ({
      id: mapRequiredInteger(settlement.id, "settlement.id"),
      username: mapOptionalText(settlement.username) ?? "",
      amount: mapNumberOrZero(settlement.amount),
      status: mapSettlementStatus(settlement.status),
      description: mapOptionalText(settlement.description),
      createdAt: mapRequiredDate(settlement.createdAt, "settlement.createdAt"),
      settlementAccountId: mapOptionalInteger(settlement.settlementAccountId)
    })),
    total: totalResult.rows[0]?.total ?? 0
  };
}
