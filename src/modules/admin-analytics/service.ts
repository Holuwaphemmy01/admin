import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import {
  AdminAnalyticsOverviewPeriod,
  AdminAnalyticsOverviewResponse,
  DEFAULT_ADMIN_ANALYTICS_OVERVIEW_PERIOD
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminAnalyticsServiceDependencies {
  queryFn?: QueryFunction;
  nowFactory?: () => Date;
}

interface AdminAnalyticsOverviewRow extends QueryResultRow {
  totalUsers: string | number | null;
  totalOrders: string | number | null;
  totalRevenue: string | number | null;
  activeStores: string | number | null;
  activeLogistics: string | number | null;
  pendingKyc: string | number | null;
  openTickets: string | number | null;
}

export class AdminAnalyticsOverviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAnalyticsOverviewValidationError";
  }
}

function getQueryFn(dependencies: AdminAnalyticsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getNowFactory(
  dependencies: AdminAnalyticsServiceDependencies = {}
): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function normalizeOverviewPeriod(
  period: string | undefined
): AdminAnalyticsOverviewPeriod {
  if (period === undefined) {
    return DEFAULT_ADMIN_ANALYTICS_OVERVIEW_PERIOD;
  }

  const normalizedPeriod = period.trim().toLowerCase();

  if (
    normalizedPeriod !== "daily" &&
    normalizedPeriod !== "weekly" &&
    normalizedPeriod !== "monthly" &&
    normalizedPeriod !== "all_time"
  ) {
    throw new AdminAnalyticsOverviewValidationError(
      "period must be one of daily, weekly, monthly, all_time"
    );
  }

  return normalizedPeriod;
}

function mapRequiredNonNegativeInteger(
  value: string | number | null | undefined,
  fieldName: string
): number {
  const numericValue =
    typeof value === "number" ? value : value === null || value === undefined ? Number.NaN : Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error(`Admin analytics overview query returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapRequiredNumber(
  value: string | number | null | undefined,
  fieldName: string
): number {
  const numericValue =
    typeof value === "number" ? value : value === null || value === undefined ? Number.NaN : Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error(`Admin analytics overview query returned an invalid ${fieldName} value`);
  }

  return Number(numericValue.toFixed(2));
}

export async function getAdminAnalyticsOverview(
  period: string | undefined,
  dependencies: AdminAnalyticsServiceDependencies = {}
): Promise<AdminAnalyticsOverviewResponse> {
  const queryFn = getQueryFn(dependencies);
  const now = getNowFactory(dependencies)();
  const normalizedPeriod = normalizeOverviewPeriod(period);
  const result = await queryFn<AdminAnalyticsOverviewRow>(
    [
      "WITH bounds AS (",
      "  SELECT",
      "    CASE",
      "      WHEN $2::text = 'daily' THEN date_trunc('day', $1::timestamptz)",
      "      WHEN $2::text = 'weekly' THEN date_trunc('week', $1::timestamptz)",
      "      WHEN $2::text = 'monthly' THEN date_trunc('month', $1::timestamptz)",
      '      ELSE NULL::timestamptz',
      '    END AS "fromDate",',
      "    CASE",
      "      WHEN $2::text = 'daily' THEN date_trunc('day', $1::timestamptz) + INTERVAL '1 day'",
      "      WHEN $2::text = 'weekly' THEN date_trunc('week', $1::timestamptz) + INTERVAL '1 week'",
      "      WHEN $2::text = 'monthly' THEN date_trunc('month', $1::timestamptz) + INTERVAL '1 month'",
      '      ELSE NULL::timestamptz',
      '    END AS "toDate"',
      "), latest_kyc AS (",
      "  SELECT",
      '    k.id, k."userId", k."createdAt",',
      '    ROW_NUMBER() OVER (PARTITION BY k."userId" ORDER BY k."createdAt" DESC, k.id DESC) AS row_number',
      "  FROM public.kyc k",
      "), pending_submissions AS (",
      "  SELECT",
      '    latest_kyc."createdAt" AS "submittedAt"',
      "  FROM latest_kyc",
      '  JOIN public."user" u ON u.id = latest_kyc."userId"',
      "  WHERE latest_kyc.row_number = 1",
      '    AND u."kycStatus" = 0',
      '    AND u."userTypeId" IN (2, 3)',
      ")",
      "SELECT",
      "  (",
      "    SELECT COUNT(*)::int",
      '    FROM public."user" u',
      "    CROSS JOIN bounds",
      '    WHERE u."userTypeId" IN (1, 2, 3)',
      '      AND (bounds."fromDate" IS NULL OR u."createdAt" >= bounds."fromDate")',
      '      AND (bounds."toDate" IS NULL OR u."createdAt" < bounds."toDate")',
      '  ) AS "totalUsers",',
      "  (",
      "    SELECT COUNT(*)::int",
      "    FROM public.order_tb o",
      "    CROSS JOIN bounds",
      '    WHERE (bounds."fromDate" IS NULL OR o."createdAt" >= bounds."fromDate")',
      '      AND (bounds."toDate" IS NULL OR o."createdAt" < bounds."toDate")',
      '  ) AS "totalOrders",',
      "  (",
      '    SELECT COALESCE(SUM(e."commissionAmount"), 0)::numeric',
      "    FROM public.earnings e",
      "    CROSS JOIN bounds",
      '    WHERE (bounds."fromDate" IS NULL OR e."createdAt" >= bounds."fromDate")',
      '      AND (bounds."toDate" IS NULL OR e."createdAt" < bounds."toDate")',
      '  ) AS "totalRevenue",',
      "  (",
      "    SELECT COUNT(*)::int",
      '    FROM public."user" u',
      "    CROSS JOIN bounds",
      '    WHERE u."userTypeId" = 2',
      "      AND u.status = 1",
      '      AND (bounds."fromDate" IS NULL OR u."createdAt" >= bounds."fromDate")',
      '      AND (bounds."toDate" IS NULL OR u."createdAt" < bounds."toDate")',
      '  ) AS "activeStores",',
      "  (",
      "    SELECT COUNT(*)::int",
      '    FROM public."user" u',
      "    CROSS JOIN bounds",
      '    WHERE u."userTypeId" = 3',
      "      AND u.status = 1",
      '      AND (bounds."fromDate" IS NULL OR u."createdAt" >= bounds."fromDate")',
      '      AND (bounds."toDate" IS NULL OR u."createdAt" < bounds."toDate")',
      '  ) AS "activeLogistics",',
      "  (",
      "    SELECT COUNT(*)::int",
      "    FROM pending_submissions ps",
      "    CROSS JOIN bounds",
      '    WHERE (bounds."fromDate" IS NULL OR ps."submittedAt" >= bounds."fromDate")',
      '      AND (bounds."toDate" IS NULL OR ps."submittedAt" < bounds."toDate")',
      '  ) AS "pendingKyc",',
      "  (",
      "    SELECT COUNT(*)::int",
      "    FROM public.support_ticket st",
      "    CROSS JOIN bounds",
      "    WHERE COALESCE(st.status, 1) = 1",
      "      AND COALESCE(st.reply, false) = false",
      '      AND (bounds."fromDate" IS NULL OR st."createdAt" >= bounds."fromDate")',
      '      AND (bounds."toDate" IS NULL OR st."createdAt" < bounds."toDate")',
      '  ) AS "openTickets"'
    ].join("\n"),
    [now, normalizedPeriod]
  );
  const overview = result.rows[0];

  if (!overview) {
    throw new Error("Admin analytics overview query did not return a row");
  }

  return {
    totalUsers: mapRequiredNonNegativeInteger(overview.totalUsers, "totalUsers"),
    totalOrders: mapRequiredNonNegativeInteger(overview.totalOrders, "totalOrders"),
    totalRevenue: mapRequiredNumber(overview.totalRevenue, "totalRevenue"),
    activeStores: mapRequiredNonNegativeInteger(overview.activeStores, "activeStores"),
    activeLogistics: mapRequiredNonNegativeInteger(overview.activeLogistics, "activeLogistics"),
    pendingKyc: mapRequiredNonNegativeInteger(overview.pendingKyc, "pendingKyc"),
    openTickets: mapRequiredNonNegativeInteger(overview.openTickets, "openTickets")
  };
}
