import { randomUUID } from "node:crypto";

import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  ManualCreditWalletRequestBody,
  ManualCreditWalletResponse,
  PLATFORM_WALLET_OWNER_USERNAME,
  PLATFORM_WALLET_RECENT_TRANSACTIONS_LIMIT,
  PlatformWalletOverviewResponse,
  UserWalletResponse
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

interface AdminWalletServiceDependencies {
  queryFn?: QueryFunction;
  runInTransaction?: RunInTransaction;
  nowFactory?: () => Date;
  uuidFactory?: () => string;
}

interface PlatformUserRow extends QueryResultRow {
  id: string | number;
  username: string | null;
}

interface WalletLookupUserRow extends QueryResultRow {
  id: string | number;
  username: string | null;
}

interface PlatformWalletRow extends QueryResultRow {
  currency?: string | null;
  availableBalance: string | number | null;
  ledgerBalance: string | number | null;
}

interface PlatformCommissionRow extends QueryResultRow {
  sellerCommissionTotal: string | number | null;
  logisticsCommissionTotal: string | number | null;
}

interface WalletForUpdateRow extends QueryResultRow {
  id: string | number;
  currency?: string | null;
  availableBalance: string | number | null;
  ledgerBalance: string | number | null;
}

interface PlatformWalletTransactionRow extends QueryResultRow {
  id: string | number;
  amount: string | number | null;
  currency: string | null;
  transactionId: string | null;
  transactionType: string | number | null;
  description: string | null;
  createdAt: Date;
}

interface CreatedWalletRow extends QueryResultRow {
  id: string | number;
  currency?: string | null;
  availableBalance: string | number | null;
  ledgerBalance: string | number | null;
}

interface CreatedWalletTransactionRow extends QueryResultRow {
  id: string | number;
}

export class PlatformWalletNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformWalletNotFoundError";
  }
}

export class UserWalletValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserWalletValidationError";
  }
}

export class UserWalletNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserWalletNotFoundError";
  }
}

export class UserWalletConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserWalletConflictError";
  }
}

export class ManualCreditWalletValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualCreditWalletValidationError";
  }
}

export class ManualCreditWalletNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualCreditWalletNotFoundError";
  }
}

export class ManualCreditWalletConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualCreditWalletConflictError";
  }
}

function getQueryFn(dependencies: AdminWalletServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getRunInTransaction(
  dependencies: AdminWalletServiceDependencies = {}
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

function getNowFactory(dependencies: AdminWalletServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function getUuidFactory(dependencies: AdminWalletServiceDependencies = {}): () => string {
  return dependencies.uuidFactory ?? randomUUID;
}

function mapRequiredInteger(value: string | number, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error(`Platform wallet query returned an invalid ${fieldName} value`);
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

function mapRequiredNumber(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Platform wallet query returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapOptionalInteger(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue)) {
    return null;
  }

  return numericValue;
}

function mapRequiredDate(value: Date, fieldName: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Platform wallet query returned an invalid ${fieldName} value`);
  }

  return value.toISOString();
}

function mapOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? null : trimmedValue;
}

function mapWalletCurrency(value: string | null | undefined): string {
  return mapOptionalText(value) ?? "NGN";
}

function normalizeRequiredUsername(value: string): string {
  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new UserWalletValidationError("username must be a non-empty string");
  }

  return normalizedValue;
}

function normalizeRequiredDescription(value: string): string {
  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new ManualCreditWalletValidationError(
      "description is required and must be a non-empty string"
    );
  }

  return normalizedValue;
}

function normalizeCreditAmount(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ManualCreditWalletValidationError(
      "amount is required and must be a positive finite number"
    );
  }

  const roundedAmount = Number(value.toFixed(2));

  if (Math.abs(value - roundedAmount) > Number.EPSILON) {
    throw new ManualCreditWalletValidationError("amount must have at most 2 decimal places");
  }

  return roundedAmount;
}

function normalizeManualCreditUsername(value: string): string {
  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new ManualCreditWalletValidationError(
      "username is required and must be a non-empty string"
    );
  }

  return normalizedValue;
}

export async function getPlatformWalletOverview(
  dependencies: AdminWalletServiceDependencies = {}
): Promise<PlatformWalletOverviewResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedPlatformUsername = normalizeCredentialValue(PLATFORM_WALLET_OWNER_USERNAME);

  const platformUserResult = await queryFn<PlatformUserRow>(
    [
      "SELECT",
      '  u.id, u.username',
      'FROM public."user" u',
      "WHERE u.username IS NOT NULL",
      "  AND BTRIM(u.username) <> ''",
      "  AND LOWER(BTRIM(u.username)) = LOWER(BTRIM($1))",
      "ORDER BY u.id ASC",
      "LIMIT 1"
    ].join("\n"),
    [normalizedPlatformUsername]
  );

  const platformUser = platformUserResult.rows[0];

  if (!platformUser || typeof platformUser.username !== "string" || platformUser.username.trim() === "") {
    throw new PlatformWalletNotFoundError("Platform wallet user not found");
  }

  const platformUserId = mapRequiredInteger(platformUser.id, "platformUser.id");

  const [walletResult, commissionSummaryResult, transactionsResult] = await Promise.all([
    queryFn<PlatformWalletRow>(
      [
        "SELECT",
        '  w."availableBalance", w."ledgerBalance"',
        "FROM public.wallet w",
        'WHERE w."userId" = $1',
        'ORDER BY w."createdAt" DESC NULLS LAST, w.id DESC',
        "LIMIT 1"
      ].join("\n"),
      [platformUserId]
    ),
    queryFn<PlatformCommissionRow>(
      [
        "SELECT",
        '  COALESCE(SUM(e."commissionAmount") FILTER (WHERE e.type = \'seller\'), 0) AS "sellerCommissionTotal",',
        '  COALESCE(SUM(e."commissionAmount") FILTER (WHERE e.type = \'logistics\'), 0) AS "logisticsCommissionTotal"',
        "FROM public.earnings e"
      ].join("\n")
    ),
    queryFn<PlatformWalletTransactionRow>(
      [
        "SELECT",
        '  wt.id, wt.amount, wt.currency, wt."transactionId", wt."transactionType", wt.description, wt."createdAt"',
        "FROM public.wallet_transaction wt",
        'WHERE wt."userId" = $1',
        'ORDER BY wt."createdAt" DESC, wt.id DESC',
        "LIMIT $2"
      ].join("\n"),
      [platformUserId, PLATFORM_WALLET_RECENT_TRANSACTIONS_LIMIT]
    )
  ]);

  const walletRow = walletResult.rows[0];
  const commissionRow = commissionSummaryResult.rows[0];
  const sellerCommissionTotal = mapNumberOrZero(commissionRow?.sellerCommissionTotal);
  const logisticsCommissionTotal = mapNumberOrZero(commissionRow?.logisticsCommissionTotal);

  return {
    platformUser: {
      id: platformUserId,
      username: platformUser.username.trim()
    },
    wallet: {
      availableBalance: mapNumberOrZero(walletRow?.availableBalance),
      ledgerBalance: mapNumberOrZero(walletRow?.ledgerBalance)
    },
    commissionSummary: {
      sellerCommissionTotal,
      logisticsCommissionTotal,
      totalCommission: Number((sellerCommissionTotal + logisticsCommissionTotal).toFixed(2))
    },
    transactions: transactionsResult.rows.map((transaction) => ({
      id: mapRequiredInteger(transaction.id, "transaction.id"),
      amount: mapNumberOrZero(transaction.amount),
      currency: mapWalletCurrency(transaction.currency),
      transactionId: mapOptionalText(transaction.transactionId),
      transactionType: mapOptionalInteger(transaction.transactionType),
      description: mapOptionalText(transaction.description),
      createdAt: mapRequiredDate(transaction.createdAt, "transaction.createdAt")
    }))
  };
}

export async function getUserWallet(
  username: string,
  dependencies: AdminWalletServiceDependencies = {}
): Promise<UserWalletResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedUsername = normalizeRequiredUsername(username);

  const userResult = await queryFn<WalletLookupUserRow>(
    [
      "SELECT",
      '  u.id, u.username',
      'FROM public."user" u',
      'WHERE u."userTypeId" IN (1, 2, 3)',
      "  AND u.username IS NOT NULL",
      "  AND BTRIM(u.username) <> ''",
      "  AND LOWER(u.username) = LOWER($1)",
      'ORDER BY u."createdAt" DESC',
      "LIMIT 2"
    ].join("\n"),
    [normalizedUsername]
  );

  if ((userResult.rowCount ?? 0) === 0) {
    throw new UserWalletNotFoundError("User wallet not found");
  }

  if ((userResult.rowCount ?? 0) > 1) {
    throw new UserWalletConflictError("Multiple users match the provided username");
  }

  const user = userResult.rows[0];

  if (!user || typeof user.username !== "string" || user.username.trim() === "") {
    throw new UserWalletNotFoundError("User wallet not found");
  }

  const userId = mapRequiredInteger(user.id, "user.id");
  const walletResult = await queryFn<PlatformWalletRow>(
    [
      "SELECT",
      '  w.currency, w."availableBalance", w."ledgerBalance"',
      "FROM public.wallet w",
      'WHERE w."userId" = $1',
      'ORDER BY w."createdAt" DESC NULLS LAST, w.id DESC',
      "LIMIT 1"
    ].join("\n"),
    [userId]
  );

  const walletRow = walletResult.rows[0];

  return {
    username: user.username.trim(),
    availableBalance: mapNumberOrZero(walletRow?.availableBalance),
    ledgerBalance: mapNumberOrZero(walletRow?.ledgerBalance),
    currency: mapWalletCurrency(walletRow?.currency)
  };
}

export async function manualCreditUserWallet(
  payload: ManualCreditWalletRequestBody & {
    actedByAdminUserId: string;
  },
  dependencies: AdminWalletServiceDependencies = {}
): Promise<ManualCreditWalletResponse> {
  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const uuidFactory = getUuidFactory(dependencies);
  const username = normalizeManualCreditUsername(payload.username);
  const amount = normalizeCreditAmount(payload.amount);
  const description = normalizeRequiredDescription(payload.description);
  const actedByAdminUserId = normalizeCredentialValue(payload.actedByAdminUserId);

  if (actedByAdminUserId === "") {
    throw new ManualCreditWalletValidationError("actedByAdminUserId is required");
  }

  return runInTransaction(async (client) => {
    const userResult = await client.query<WalletLookupUserRow>(
      [
        "SELECT",
        '  u.id, u.username',
        'FROM public."user" u',
        'WHERE u."userTypeId" IN (1, 2, 3)',
        "  AND u.username IS NOT NULL",
        "  AND BTRIM(u.username) <> ''",
        "  AND LOWER(u.username) = LOWER($1)",
        'ORDER BY u."createdAt" DESC',
        "LIMIT 2",
        "FOR UPDATE"
      ].join("\n"),
      [username]
    );

    if ((userResult.rowCount ?? 0) === 0) {
      throw new ManualCreditWalletNotFoundError("User wallet target not found");
    }

    if ((userResult.rowCount ?? 0) > 1) {
      throw new ManualCreditWalletConflictError("Multiple users match the provided username");
    }

    const user = userResult.rows[0];

    if (!user || typeof user.username !== "string" || user.username.trim() === "") {
      throw new ManualCreditWalletNotFoundError("User wallet target not found");
    }

    const targetUserId = mapRequiredInteger(user.id, "user.id");
    const walletResult = await client.query<WalletForUpdateRow>(
      [
        "SELECT",
        '  w.id, w.currency, w."availableBalance", w."ledgerBalance"',
        "FROM public.wallet w",
        'WHERE w."userId" = $1',
        'ORDER BY w."createdAt" DESC NULLS LAST, w.id DESC',
        "LIMIT 1",
        "FOR UPDATE"
      ].join("\n"),
      [targetUserId]
    );

    const now = nowFactory();
    let wallet = walletResult.rows[0];
    let walletId: number;
    let walletCurrency = "NGN";
    let previousAvailableBalance = 0;
    let previousLedgerBalance = 0;

    if (!wallet) {
      const createdWalletResult = await client.query<CreatedWalletRow>(
        [
          "INSERT INTO public.wallet (",
          '  "userId", amount, currency, "ledgerBalance", "availableBalance", status, "createdAt", "updatedAt"',
          ") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          'RETURNING id, currency, "availableBalance", "ledgerBalance"'
        ].join("\n"),
        [targetUserId, null, "NGN", 0, 0, 1, now, now]
      );

      wallet = createdWalletResult.rows[0];
    }

    if (!wallet) {
      throw new Error("Wallet credit creation did not return a wallet row");
    }

    walletId = mapRequiredInteger(wallet.id, "wallet.id");
    walletCurrency = mapWalletCurrency(wallet.currency);
    previousAvailableBalance = mapNumberOrZero(wallet.availableBalance);
    previousLedgerBalance = mapNumberOrZero(wallet.ledgerBalance);

    const newAvailableBalance = Number((previousAvailableBalance + amount).toFixed(2));
    const newLedgerBalance = Number((previousLedgerBalance + amount).toFixed(2));

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
      "MANUAL_CREDIT",
      targetUserId,
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
        targetUserId,
        amount,
        walletCurrency,
        transactionReference,
        null,
        null,
        1,
        newLedgerBalance,
        newAvailableBalance,
        description,
        1,
        now,
        now
      ]
    );

    const walletTransaction = walletTransactionResult.rows[0];

    if (!walletTransaction) {
      throw new Error("Wallet credit transaction insert did not return a row");
    }

    const walletTransactionId = mapRequiredInteger(
      walletTransaction.id,
      "walletTransaction.id"
    );

    await client.query(
      [
        "INSERT INTO public.admin_wallet_action_audit_logs (",
        '  id, "targetUserId", "targetWalletId", "walletTransactionId", "actedByAdminUserId",',
        '  action, amount, description, "previousAvailableBalance", "newAvailableBalance",',
        '  "previousLedgerBalance", "newLedgerBalance", "createdAt"',
        ") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)"
      ].join("\n"),
      [
        uuidFactory(),
        targetUserId,
        walletId,
        walletTransactionId,
        actedByAdminUserId,
        "manual_credit",
        amount,
        description,
        previousAvailableBalance,
        newAvailableBalance,
        previousLedgerBalance,
        newLedgerBalance,
        now
      ]
    );

    return {
      message: "Wallet credited successfully",
      newBalance: newAvailableBalance
    };
  });
}
