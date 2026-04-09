import { randomUUID } from "node:crypto";

import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  AdminApproveSettlementRequestBody,
  AdminApproveSettlementResponse,
  AdminRejectSettlementRequestBody,
  AdminRejectSettlementResponse,
  AdminSettlementStatus,
  AdminSettlementsListFilters,
  AdminSettlementsListResponse,
  AdminSettlementsStatsResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminSettlementsServiceDependencies {
  queryFn?: QueryFunction;
  runInTransaction?: RunInTransaction;
  nowFactory?: () => Date;
  uuidFactory?: () => string;
}

interface TransactionClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

type RunInTransaction = <T>(operation: (client: TransactionClient) => Promise<T>) => Promise<T>;

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

interface AdminSettlementStatsRow extends QueryResultRow {
  totalPending: string | number | null;
  totalApproved: string | number | null;
  totalRejected: string | number | null;
  pendingAmount: string | number | null;
  approvedAmount: string | number | null;
}

interface SettlementForApprovalRow extends QueryResultRow {
  id: string | number;
  userId: string | number | null;
  username: string | null;
  status: string | number | null;
}

interface SettlementAccountRow extends QueryResultRow {
  id: string | number;
  userId: string | number | null;
  status: string | number | null;
}

interface WalletForApprovalRow extends QueryResultRow {
  id: string | number;
  currency: string | null;
  availableBalance: string | number | null;
  ledgerBalance: string | number | null;
}

interface CreatedWalletTransactionRow extends QueryResultRow {
  id: string | number;
}

export class AdminSettlementsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSettlementsValidationError";
  }
}

export class AdminSettlementApprovalNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSettlementApprovalNotFoundError";
  }
}

export class AdminSettlementApprovalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSettlementApprovalConflictError";
  }
}

export class AdminSettlementRejectionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSettlementRejectionNotFoundError";
  }
}

export class AdminSettlementRejectionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSettlementRejectionConflictError";
  }
}

function getQueryFn(dependencies: AdminSettlementsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getRunInTransaction(
  dependencies: AdminSettlementsServiceDependencies = {}
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

function getNowFactory(dependencies: AdminSettlementsServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function getUuidFactory(dependencies: AdminSettlementsServiceDependencies = {}): () => string {
  return dependencies.uuidFactory ?? randomUUID;
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

function normalizeRequiredUsername(value: string): string {
  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new AdminSettlementsValidationError("username must be a non-empty string");
  }

  return normalizedValue;
}

function normalizeRequiredDescription(value: string): string {
  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new AdminSettlementsValidationError("description must be a non-empty string");
  }

  return normalizedValue;
}

function normalizeRequiredReason(value: string): string {
  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new AdminSettlementsValidationError("reason must be a non-empty string");
  }

  return normalizedValue;
}

function normalizeAmount(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new AdminSettlementsValidationError(
      "amount must be a positive finite number"
    );
  }

  const roundedAmount = Number(value.toFixed(2));

  if (Math.abs(value - roundedAmount) > Number.EPSILON) {
    throw new AdminSettlementsValidationError("amount must have at most 2 decimal places");
  }

  return roundedAmount;
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

export async function getAdminSettlementsStats(
  dependencies: AdminSettlementsServiceDependencies = {}
): Promise<AdminSettlementsStatsResponse> {
  const queryFn = getQueryFn(dependencies);

  const statsResult = await queryFn<AdminSettlementStatsRow>(
    [
      "SELECT",
      "  COUNT(*) FILTER (WHERE s.status = 1)::int AS \"totalPending\",",
      "  COUNT(*) FILTER (WHERE s.status = 2)::int AS \"totalApproved\",",
      "  COUNT(*) FILTER (WHERE s.status = 3)::int AS \"totalRejected\",",
      '  COALESCE(SUM(s.amount) FILTER (WHERE s.status = 1), 0) AS "pendingAmount",',
      '  COALESCE(SUM(s.amount) FILTER (WHERE s.status = 2), 0) AS "approvedAmount"',
      "FROM public.settlement s",
      "WHERE s.status IN (1, 2, 3)"
    ].join("\n")
  );

  const stats = statsResult.rows[0];

  return {
    totalPending: mapNumberOrZero(stats?.totalPending),
    totalApproved: mapNumberOrZero(stats?.totalApproved),
    totalRejected: mapNumberOrZero(stats?.totalRejected),
    pendingAmount: mapNumberOrZero(stats?.pendingAmount),
    approvedAmount: mapNumberOrZero(stats?.approvedAmount)
  };
}

export async function approveAdminSettlement(
  settlementId: number,
  payload: AdminApproveSettlementRequestBody & { actedByAdminUserId: string },
  dependencies: AdminSettlementsServiceDependencies = {}
): Promise<AdminApproveSettlementResponse> {
  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const uuidFactory = getUuidFactory(dependencies);
  const normalizedSettlementId = normalizePositiveInteger(settlementId, "id");
  const normalizedUsername = normalizeRequiredUsername(payload.username);
  const normalizedAmount = normalizeAmount(payload.amount);
  const normalizedDescription = normalizeRequiredDescription(payload.description);
  const normalizedSettlementAccountId = normalizePositiveInteger(
    payload.settlementAccountId,
    "settlementAccountId"
  );
  const actedByAdminUserId = normalizeCredentialValue(payload.actedByAdminUserId);

  if (actedByAdminUserId === "") {
    throw new AdminSettlementsValidationError("actedByAdminUserId is required");
  }

  return runInTransaction(async (client) => {
    const settlementResult = await client.query<SettlementForApprovalRow>(
      [
        "SELECT",
        '  s.id, s."userId", u.username, s.status',
        "FROM public.settlement s",
        'INNER JOIN public."user" u ON u.id = s."userId"',
        "WHERE s.id = $1",
        "FOR UPDATE"
      ].join("\n"),
      [normalizedSettlementId]
    );

    const settlement = settlementResult.rows[0];

    if (!settlement) {
      throw new AdminSettlementApprovalNotFoundError("Settlement request not found");
    }

    const beneficiaryUserId = mapRequiredInteger(settlement.userId, "settlement.userId");
    const settlementUsername = normalizeRequiredUsername(settlement.username ?? "");
    const settlementStatusCode =
      settlement.status === null || settlement.status === undefined
        ? null
        : typeof settlement.status === "number"
          ? settlement.status
          : Number(settlement.status);

    if (settlementUsername.toLowerCase() !== normalizedUsername.toLowerCase()) {
      throw new AdminSettlementApprovalConflictError(
        "Beneficiary username does not match the settlement request"
      );
    }

    if (settlementStatusCode !== 1) {
      throw new AdminSettlementApprovalConflictError("Settlement request is not pending");
    }

    const settlementAccountResult = await client.query<SettlementAccountRow>(
      [
        "SELECT",
        '  sa.id, sa."userId", sa.status',
        "FROM public.settlement_account sa",
        "WHERE sa.id = $1"
      ].join("\n"),
      [normalizedSettlementAccountId]
    );

    const settlementAccount = settlementAccountResult.rows[0];

    if (!settlementAccount) {
      throw new AdminSettlementApprovalConflictError(
        "Settlement account does not belong to the beneficiary user"
      );
    }

    const settlementAccountUserId = mapRequiredInteger(
      settlementAccount.userId,
      "settlementAccount.userId"
    );
    const settlementAccountStatus =
      settlementAccount.status === null || settlementAccount.status === undefined
        ? null
        : typeof settlementAccount.status === "number"
          ? settlementAccount.status
          : Number(settlementAccount.status);

    if (settlementAccountUserId !== beneficiaryUserId || settlementAccountStatus !== 1) {
      throw new AdminSettlementApprovalConflictError(
        "Settlement account does not belong to the beneficiary user"
      );
    }

    const walletResult = await client.query<WalletForApprovalRow>(
      [
        "SELECT",
        '  w.id, w.currency, w."availableBalance", w."ledgerBalance"',
        "FROM public.wallet w",
        'WHERE w."userId" = $1',
        'ORDER BY w."createdAt" DESC NULLS LAST, w.id DESC',
        "LIMIT 1",
        "FOR UPDATE"
      ].join("\n"),
      [beneficiaryUserId]
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      throw new AdminSettlementApprovalConflictError(
        "Beneficiary wallet not found for settlement payout"
      );
    }

    const walletId = mapRequiredInteger(wallet.id, "wallet.id");
    const walletCurrency = mapOptionalText(wallet.currency) ?? "NGN";
    const previousAvailableBalance = mapNumberOrZero(wallet.availableBalance);
    const previousLedgerBalance = mapNumberOrZero(wallet.ledgerBalance);

    if (
      previousAvailableBalance < normalizedAmount ||
      previousLedgerBalance < normalizedAmount
    ) {
      throw new AdminSettlementApprovalConflictError(
        "Insufficient available balance for settlement payout"
      );
    }

    const now = nowFactory();
    const newAvailableBalance = Number((previousAvailableBalance - normalizedAmount).toFixed(2));
    const newLedgerBalance = Number((previousLedgerBalance - normalizedAmount).toFixed(2));

    await client.query(
      [
        "UPDATE public.settlement",
        'SET amount = $1,',
        '    description = $2,',
        '    "settlementAccountId" = $3,',
        "    status = $4,",
        '    "updatedAt" = $5',
        "WHERE id = $6"
      ].join("\n"),
      [
        normalizedAmount,
        normalizedDescription,
        normalizedSettlementAccountId,
        2,
        now,
        normalizedSettlementId
      ]
    );

    await client.query(
      [
        "UPDATE public.wallet",
        'SET "availableBalance" = $1,',
        '    "ledgerBalance" = $2,',
        '    "updatedAt" = $3',
        "WHERE id = $4"
      ].join("\n"),
      [newAvailableBalance, newLedgerBalance, now, walletId]
    );

    const transactionReference = [
      "SETTLEMENT",
      normalizedSettlementId,
      "APPROVED",
      now.getTime(),
      actedByAdminUserId
    ].join(":");

    const walletTransactionResult = await client.query<CreatedWalletTransactionRow>(
      [
        "INSERT INTO public.wallet_transaction (",
        '  "userId", amount, currency, "transactionId", "settlementId", "refundId",',
        '  "transactionType", "ledgerBalance", "availableBalance", description, status, "createdAt", "updatedAt"',
        ") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        "RETURNING id"
      ].join("\n"),
      [
        beneficiaryUserId,
        normalizedAmount,
        walletCurrency,
        transactionReference,
        normalizedSettlementId,
        null,
        2,
        newLedgerBalance,
        newAvailableBalance,
        normalizedDescription,
        1,
        now,
        now
      ]
    );

    const walletTransaction = walletTransactionResult.rows[0];

    if (!walletTransaction) {
      throw new Error("Settlement wallet transaction insert did not return a row");
    }

    const walletTransactionId = mapRequiredInteger(
      walletTransaction.id,
      "walletTransaction.id"
    );

    await client.query(
      [
        "INSERT INTO public.admin_settlement_action_audit_logs (",
        '  id, "settlementId", "targetUserId", "targetWalletId", "settlementAccountId",',
        '  "walletTransactionId", "actedByAdminUserId", action, amount, description,',
        '  "previousStatus", "newStatus", "previousAvailableBalance", "newAvailableBalance",',
        '  "previousLedgerBalance", "newLedgerBalance", "createdAt"',
        ") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)"
      ].join("\n"),
      [
        uuidFactory(),
        normalizedSettlementId,
        beneficiaryUserId,
        walletId,
        normalizedSettlementAccountId,
        walletTransactionId,
        actedByAdminUserId,
        "approve_settlement",
        normalizedAmount,
        normalizedDescription,
        1,
        2,
        previousAvailableBalance,
        newAvailableBalance,
        previousLedgerBalance,
        newLedgerBalance,
        now
      ]
    );

    return {
      message: "Settlement successfully saved"
    };
  });
}

export async function rejectAdminSettlement(
  settlementId: number,
  payload: AdminRejectSettlementRequestBody & { actedByAdminUserId: string },
  dependencies: AdminSettlementsServiceDependencies = {}
): Promise<AdminRejectSettlementResponse> {
  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const uuidFactory = getUuidFactory(dependencies);
  const normalizedSettlementId = normalizePositiveInteger(settlementId, "id");
  const normalizedReason = normalizeRequiredReason(payload.reason);
  const actedByAdminUserId = normalizeCredentialValue(payload.actedByAdminUserId);

  if (actedByAdminUserId === "") {
    throw new AdminSettlementsValidationError("actedByAdminUserId is required");
  }

  return runInTransaction(async (client) => {
    const settlementResult = await client.query<SettlementForApprovalRow>(
      [
        "SELECT",
        '  s.id, s."userId", u.username, s.status',
        "FROM public.settlement s",
        'INNER JOIN public."user" u ON u.id = s."userId"',
        "WHERE s.id = $1",
        "FOR UPDATE"
      ].join("\n"),
      [normalizedSettlementId]
    );

    const settlement = settlementResult.rows[0];

    if (!settlement) {
      throw new AdminSettlementRejectionNotFoundError("Settlement request not found");
    }

    const beneficiaryUserId = mapRequiredInteger(settlement.userId, "settlement.userId");
    const settlementStatusCode =
      settlement.status === null || settlement.status === undefined
        ? null
        : typeof settlement.status === "number"
          ? settlement.status
          : Number(settlement.status);

    if (settlementStatusCode !== 1) {
      throw new AdminSettlementRejectionConflictError("Settlement request is not pending");
    }

    const now = nowFactory();

    await client.query(
      [
        "UPDATE public.settlement",
        "SET status = $1,",
        '    "updatedAt" = $2',
        "WHERE id = $3"
      ].join("\n"),
      [3, now, normalizedSettlementId]
    );

    await client.query(
      [
        "INSERT INTO public.admin_settlement_rejection_audit_logs (",
        '  id, "settlementId", "targetUserId", "actedByAdminUserId", reason,',
        '  "previousStatus", "newStatus", "createdAt"',
        ") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
      ].join("\n"),
      [
        uuidFactory(),
        normalizedSettlementId,
        beneficiaryUserId,
        actedByAdminUserId,
        normalizedReason,
        1,
        3,
        now
      ]
    );

    return {
      message: "Settlement rejected"
    };
  });
}
