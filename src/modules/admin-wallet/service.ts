import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  PLATFORM_WALLET_OWNER_USERNAME,
  PLATFORM_WALLET_RECENT_TRANSACTIONS_LIMIT,
  PlatformWalletOverviewResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminWalletServiceDependencies {
  queryFn?: QueryFunction;
}

interface PlatformUserRow extends QueryResultRow {
  id: string | number;
  username: string | null;
}

interface PlatformWalletRow extends QueryResultRow {
  availableBalance: string | number | null;
  ledgerBalance: string | number | null;
}

interface PlatformCommissionRow extends QueryResultRow {
  sellerCommissionTotal: string | number | null;
  logisticsCommissionTotal: string | number | null;
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

export class PlatformWalletNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformWalletNotFoundError";
  }
}

function getQueryFn(dependencies: AdminWalletServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
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
      currency: mapOptionalText(transaction.currency) ?? "NGN",
      transactionId: mapOptionalText(transaction.transactionId),
      transactionType: mapOptionalInteger(transaction.transactionType),
      description: mapOptionalText(transaction.description),
      createdAt: mapRequiredDate(transaction.createdAt, "transaction.createdAt")
    }))
  };
}
