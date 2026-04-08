import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import {
  AdminTransactionType,
  AdminTransactionDetailsResponse,
  AdminTransactionsListFilters,
  AdminTransactionsListResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminTransactionsServiceDependencies {
  queryFn?: QueryFunction;
}

interface AdminTransactionRow extends QueryResultRow {
  id: string | number;
  userId: string | number | null;
  amount: string | number | null;
  currency: string | null;
  transactionId: string | null;
  transactionType: string | number | null;
  description: string | null;
  status: string | number | null;
  createdAt: Date;
}

interface AdminTransactionDetailsRow extends QueryResultRow {
  id: string | number;
  userId: string | number | null;
  amount: string | number | null;
  currency: string | null;
  transactionId: string | null;
  settlementId: string | number | null;
  refundId: string | number | null;
  transactionType: string | number | null;
  description: string | null;
  ledgerBalance: string | number | null;
  availableBalance: string | number | null;
  status: string | number | null;
  createdAt: Date;
}

interface TotalCountRow extends QueryResultRow {
  total: number;
}

export class AdminTransactionsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminTransactionsValidationError";
  }
}

export class AdminTransactionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminTransactionNotFoundError";
  }
}

export class AdminTransactionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminTransactionConflictError";
  }
}

function getQueryFn(dependencies: AdminTransactionsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AdminTransactionsValidationError(`${fieldName} must be a positive integer`);
  }

  return value;
}

function normalizeOptionalTransactionType(
  value: string | undefined
): AdminTransactionType | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "credit" && value !== "debit") {
    throw new AdminTransactionsValidationError("transactionType must be one of credit or debit");
  }

  return value;
}

function mapRequiredInteger(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error(`Admin transactions query returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapRequiredNumber(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Admin transactions query returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapNullableInteger(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue)) {
    return null;
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

function mapCurrency(value: string | null | undefined): string {
  return mapOptionalText(value) ?? "NGN";
}

function mapTransactionType(value: string | number | null | undefined): AdminTransactionType {
  const numericValue =
    value === null || value === undefined
      ? null
      : typeof value === "number"
        ? value
        : Number(value);

  if (numericValue === 2) {
    return "debit";
  }

  // Legacy rows may not have a transaction type stored; treat them as credits.
  return "credit";
}

function normalizeRequiredTransactionReference(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new AdminTransactionsValidationError("transactionId must be a non-empty string");
  }

  return normalizedValue;
}

function buildTransactionFilters(filters: AdminTransactionsListFilters): {
  whereSql: string;
  params: unknown[];
} {
  const clauses = ["1 = 1"];
  const params: unknown[] = [];

  if (typeof filters.userId === "number") {
    params.push(filters.userId);
    clauses.push(`wt."userId" = $${params.length}`);
  }

  if (typeof filters.transactionType === "string") {
    params.push(filters.transactionType === "credit" ? 1 : 2);
    clauses.push(`wt."transactionType" = $${params.length}`);
  }

  if (filters.from instanceof Date) {
    params.push(filters.from);
    clauses.push(`wt."createdAt" >= $${params.length}`);
  }

  if (filters.to instanceof Date) {
    params.push(filters.to);
    clauses.push(`wt."createdAt" <= $${params.length}`);
  }

  return {
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params
  };
}

export async function listAdminTransactions(
  filters: AdminTransactionsListFilters,
  dependencies: AdminTransactionsServiceDependencies = {}
): Promise<AdminTransactionsListResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedFilters: AdminTransactionsListFilters = {
    page: normalizePositiveInteger(filters.page, "page"),
    limit: normalizePositiveInteger(filters.limit, "limit"),
    ...(filters.userId !== undefined
      ? { userId: normalizePositiveInteger(filters.userId, "userId") }
      : {}),
    ...(filters.transactionType !== undefined
      ? { transactionType: normalizeOptionalTransactionType(filters.transactionType) }
      : {}),
    ...(filters.from instanceof Date ? { from: filters.from } : {}),
    ...(filters.to instanceof Date ? { to: filters.to } : {})
  };

  if (
    normalizedFilters.from instanceof Date &&
    normalizedFilters.to instanceof Date &&
    normalizedFilters.from > normalizedFilters.to
  ) {
    throw new AdminTransactionsValidationError("from must be less than or equal to to");
  }

  const { whereSql, params } = buildTransactionFilters(normalizedFilters);
  const paginationParams = [
    ...params,
    normalizedFilters.limit,
    (normalizedFilters.page - 1) * normalizedFilters.limit
  ];

  const transactionsResult = await queryFn<AdminTransactionRow>(
    [
      "SELECT",
      '  wt.id, wt."userId", wt.amount, wt.currency, wt."transactionId",',
      '  wt."transactionType", wt.description, wt.status, wt."createdAt"',
      "FROM public.wallet_transaction wt",
      whereSql,
      'ORDER BY wt."createdAt" DESC, wt.id DESC',
      `LIMIT $${params.length + 1}`,
      `OFFSET $${params.length + 2}`
    ].join("\n"),
    paginationParams
  );

  const totalResult = await queryFn<TotalCountRow>(
    [
      "SELECT",
      "  COUNT(*)::int AS total",
      "FROM public.wallet_transaction wt",
      whereSql
    ].join("\n"),
    params
  );

  return {
    transactions: transactionsResult.rows.map((transaction) => ({
      id: mapRequiredInteger(transaction.id, "id"),
      userId: mapRequiredInteger(transaction.userId, "userId"),
      amount: mapRequiredNumber(transaction.amount, "amount"),
      currency: mapCurrency(transaction.currency),
      transactionId: mapOptionalText(transaction.transactionId),
      transactionType: mapTransactionType(transaction.transactionType),
      description: mapOptionalText(transaction.description),
      status: mapRequiredInteger(transaction.status, "status"),
      createdAt:
        transaction.createdAt instanceof Date && !Number.isNaN(transaction.createdAt.getTime())
          ? transaction.createdAt.toISOString()
          : (() => {
              throw new Error("Admin transactions query returned an invalid createdAt value");
            })()
    })),
    total: Number(totalResult.rows[0]?.total ?? 0)
  };
}

export async function getAdminTransactionDetails(
  transactionId: string,
  dependencies: AdminTransactionsServiceDependencies = {}
): Promise<AdminTransactionDetailsResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedTransactionId = normalizeRequiredTransactionReference(transactionId);

  const result = await queryFn<AdminTransactionDetailsRow>(
    [
      "SELECT",
      '  wt.id, wt."userId", wt.amount, wt.currency, wt."transactionId", wt."settlementId",',
      '  wt."refundId", wt."transactionType", wt.description, wt."ledgerBalance",',
      '  wt."availableBalance", wt.status, wt."createdAt"',
      "FROM public.wallet_transaction wt",
      'WHERE wt."transactionId" IS NOT NULL',
      '  AND BTRIM(wt."transactionId") = BTRIM($1)',
      'ORDER BY wt."createdAt" DESC, wt.id DESC',
      "LIMIT 2"
    ].join("\n"),
    [normalizedTransactionId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new AdminTransactionNotFoundError("Transaction not found");
  }

  if ((result.rowCount ?? 0) > 1) {
    throw new AdminTransactionConflictError(
      "Multiple transactions match the provided transactionId"
    );
  }

  const transaction = result.rows[0];

  if (!transaction || typeof transaction.transactionId !== "string" || transaction.transactionId.trim() === "") {
    throw new AdminTransactionNotFoundError("Transaction not found");
  }

  return {
    id: mapRequiredInteger(transaction.id, "id"),
    userId: mapRequiredInteger(transaction.userId, "userId"),
    amount: mapRequiredNumber(transaction.amount, "amount"),
    currency: mapCurrency(transaction.currency),
    transactionId: transaction.transactionId.trim(),
    settlementId: mapNullableInteger(transaction.settlementId),
    refundId: mapNullableInteger(transaction.refundId),
    transactionType: mapTransactionType(transaction.transactionType),
    description: mapOptionalText(transaction.description),
    ledgerBalance: mapRequiredNumber(transaction.ledgerBalance, "ledgerBalance"),
    availableBalance: mapRequiredNumber(transaction.availableBalance, "availableBalance"),
    status: mapRequiredInteger(transaction.status, "status"),
    createdAt:
      transaction.createdAt instanceof Date && !Number.isNaN(transaction.createdAt.getTime())
        ? transaction.createdAt.toISOString()
        : (() => {
            throw new Error("Admin transaction detail query returned an invalid createdAt value");
          })()
  };
}
