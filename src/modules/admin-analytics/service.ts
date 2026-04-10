import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import {
  AdminAnalyticsRevenueBreakdownByCategoryItem,
  AdminAnalyticsRevenueBreakdownByPeriodItem,
  AdminAnalyticsRevenueBreakdownByTierItem,
  AdminAnalyticsRevenueFilters,
  AdminAnalyticsRevenueGroupBy,
  AdminAnalyticsRevenueResponse,
  AdminAnalyticsOverviewPeriod,
  AdminAnalyticsOverviewResponse,
  AdminAnalyticsTopProductsFilters,
  AdminAnalyticsTopProductsPeriod,
  AdminAnalyticsTopProductsResponse,
  AdminAnalyticsTopSellersFilters,
  AdminAnalyticsTopSellersPeriod,
  AdminAnalyticsTopSellersResponse,
  DEFAULT_ADMIN_ANALYTICS_OVERVIEW_PERIOD,
  DEFAULT_ADMIN_ANALYTICS_TOP_PRODUCTS_LIMIT,
  DEFAULT_ADMIN_ANALYTICS_TOP_PRODUCTS_PERIOD,
  DEFAULT_ADMIN_ANALYTICS_TOP_SELLERS_LIMIT,
  DEFAULT_ADMIN_ANALYTICS_TOP_SELLERS_PERIOD,
  MAX_ADMIN_ANALYTICS_TOP_PRODUCTS_LIMIT,
  MAX_ADMIN_ANALYTICS_TOP_SELLERS_LIMIT,
  DEFAULT_ADMIN_ANALYTICS_REVENUE_GROUP_BY
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

interface AdminAnalyticsRevenueTotalsRow extends QueryResultRow {
  totalRevenue: string | number | null;
  subscriptionRevenue: string | number | null;
  commissionRevenue: string | number | null;
  adRevenue: string | number | null;
}

interface AdminAnalyticsRevenueCategoryBreakdownRow extends QueryResultRow {
  category: string | null;
  revenue: string | number | null;
}

interface AdminAnalyticsRevenueTierBreakdownRow extends QueryResultRow {
  tier: string | null;
  revenue: string | number | null;
}

interface AdminAnalyticsRevenuePeriodBreakdownRow extends QueryResultRow {
  period: Date | string | null;
  revenue: string | number | null;
}

interface AdminAnalyticsTopSellerRow extends QueryResultRow {
  username: string | null;
  totalOrders: string | number | null;
  totalRevenue: string | number | null;
  rating: string | number | null;
}

interface AdminAnalyticsTopProductRow extends QueryResultRow {
  productId: string | number | null;
  name: string | null;
  totalSold: string | number | null;
  revenue: string | number | null;
  seller: string | null;
}

export class AdminAnalyticsOverviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAnalyticsOverviewValidationError";
  }
}

export class AdminAnalyticsRevenueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAnalyticsRevenueValidationError";
  }
}

export class AdminAnalyticsTopSellersValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAnalyticsTopSellersValidationError";
  }
}

export class AdminAnalyticsTopProductsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAnalyticsTopProductsValidationError";
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

function normalizeOptionalDate(
  value: Date | undefined,
  fieldName: "from" | "to"
): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new AdminAnalyticsRevenueValidationError(
      `${fieldName} must be a valid ISO 8601 datetime`
    );
  }

  return value;
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

function normalizeRevenueGroupBy(
  groupBy: string | undefined
): AdminAnalyticsRevenueGroupBy {
  if (groupBy === undefined) {
    return DEFAULT_ADMIN_ANALYTICS_REVENUE_GROUP_BY;
  }

  const normalizedGroupBy = groupBy.trim().toLowerCase();

  if (
    normalizedGroupBy !== "category" &&
    normalizedGroupBy !== "tier" &&
    normalizedGroupBy !== "period"
  ) {
    throw new AdminAnalyticsRevenueValidationError(
      "groupBy must be one of category, tier, period"
    );
  }

  return normalizedGroupBy;
}

function normalizeRevenueFilters(
  filters: AdminAnalyticsRevenueFilters = {}
): {
  groupBy: AdminAnalyticsRevenueGroupBy;
  from?: Date;
  to?: Date;
} {
  const normalizedFilters = {
    groupBy: normalizeRevenueGroupBy(filters.groupBy),
    from: normalizeOptionalDate(filters.from, "from"),
    to: normalizeOptionalDate(filters.to, "to")
  };

  if (
    normalizedFilters.from instanceof Date &&
    normalizedFilters.to instanceof Date &&
    normalizedFilters.from > normalizedFilters.to
  ) {
    throw new AdminAnalyticsRevenueValidationError("from must be less than or equal to to");
  }

  return normalizedFilters;
}

function normalizeTopSellersPeriod(
  period: string | undefined
): AdminAnalyticsTopSellersPeriod {
  if (period === undefined) {
    return DEFAULT_ADMIN_ANALYTICS_TOP_SELLERS_PERIOD;
  }

  const normalizedPeriod = period.trim().toLowerCase();

  if (
    normalizedPeriod !== "daily" &&
    normalizedPeriod !== "weekly" &&
    normalizedPeriod !== "monthly"
  ) {
    throw new AdminAnalyticsTopSellersValidationError(
      "period must be one of daily, weekly, monthly"
    );
  }

  return normalizedPeriod;
}

function normalizeTopSellersLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_ADMIN_ANALYTICS_TOP_SELLERS_LIMIT;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new AdminAnalyticsTopSellersValidationError("limit must be a positive integer");
  }

  return Math.min(limit, MAX_ADMIN_ANALYTICS_TOP_SELLERS_LIMIT);
}

function normalizeTopSellersFilters(
  filters: AdminAnalyticsTopSellersFilters = {}
): {
  limit: number;
  period: AdminAnalyticsTopSellersPeriod;
} {
  return {
    limit: normalizeTopSellersLimit(filters.limit),
    period: normalizeTopSellersPeriod(filters.period)
  };
}

function normalizeTopProductsPeriod(
  period: string | undefined
): AdminAnalyticsTopProductsPeriod {
  if (period === undefined) {
    return DEFAULT_ADMIN_ANALYTICS_TOP_PRODUCTS_PERIOD;
  }

  const normalizedPeriod = period.trim().toLowerCase();

  if (
    normalizedPeriod !== "daily" &&
    normalizedPeriod !== "weekly" &&
    normalizedPeriod !== "monthly"
  ) {
    throw new AdminAnalyticsTopProductsValidationError(
      "period must be one of daily, weekly, monthly"
    );
  }

  return normalizedPeriod;
}

function normalizeTopProductsLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_ADMIN_ANALYTICS_TOP_PRODUCTS_LIMIT;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new AdminAnalyticsTopProductsValidationError("limit must be a positive integer");
  }

  return Math.min(limit, MAX_ADMIN_ANALYTICS_TOP_PRODUCTS_LIMIT);
}

function normalizeTopProductsCategoryId(categoryId: number | undefined): number | undefined {
  if (categoryId === undefined) {
    return undefined;
  }

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new AdminAnalyticsTopProductsValidationError(
      "categoryId must be a positive integer"
    );
  }

  return categoryId;
}

function normalizeTopProductsFilters(
  filters: AdminAnalyticsTopProductsFilters = {}
): {
  limit: number;
  categoryId?: number;
  period: AdminAnalyticsTopProductsPeriod;
} {
  return {
    limit: normalizeTopProductsLimit(filters.limit),
    categoryId: normalizeTopProductsCategoryId(filters.categoryId),
    period: normalizeTopProductsPeriod(filters.period)
  };
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

function mapRevenueNumber(
  value: string | number | null | undefined,
  fieldName: string
): number {
  const numericValue =
    typeof value === "number" ? value : value === null || value === undefined ? Number.NaN : Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error(`Admin analytics revenue query returned an invalid ${fieldName} value`);
  }

  return Number(numericValue.toFixed(2));
}

function mapRequiredText(
  value: string | null | undefined,
  fieldName: string
): string {
  if (typeof value !== "string") {
    throw new Error(`Admin analytics revenue query returned an invalid ${fieldName} value`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new Error(`Admin analytics revenue query returned an invalid ${fieldName} value`);
  }

  return normalizedValue;
}

function mapRequiredIsoString(
  value: Date | string | null | undefined,
  fieldName: string
): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsedValue = new Date(value);

    if (!Number.isNaN(parsedValue.getTime())) {
      return parsedValue.toISOString();
    }
  }

  throw new Error(`Admin analytics revenue query returned an invalid ${fieldName} value`);
}

function buildRevenueEventsCte(
  fromParameterIndex: number,
  toParameterIndex: number
): string[] {
  return [
    "WITH bounds AS (",
    "  SELECT",
    `    $${fromParameterIndex}::timestamp with time zone AS "fromDate",`,
    `    $${toParameterIndex}::timestamp with time zone AS "toDate"`,
    "), revenue_events AS (",
    "  SELECT",
    "    'subscription'::text AS source,",
    "    'subscription'::text AS category,",
    "    COALESCE(NULLIF(BTRIM(s.name), ''), 'Unknown') AS tier,",
    '    us."createdAt" AS "eventAt",',
    '    us."initiatedAmountToPayNext"::numeric AS amount',
    "  FROM public.user_subscription us",
    '  INNER JOIN public.subscription s ON s.id = us."subscriptionId"',
    "  CROSS JOIN bounds",
    '  WHERE COALESCE(us."initiatedAmountToPayNext", 0) > 0',
    '    AND (bounds."fromDate" IS NULL OR us."createdAt" >= bounds."fromDate")',
    '    AND (bounds."toDate" IS NULL OR us."createdAt" <= bounds."toDate")',
    "  UNION ALL",
    "  SELECT",
    "    'commission'::text AS source,",
    "    'commission'::text AS category,",
    '    COALESCE(NULLIF(BTRIM(e."subscriptionTier"), \'\'), \'Unknown\') AS tier,',
    '    e."createdAt" AS "eventAt",',
    '    e."commissionAmount"::numeric AS amount',
    "  FROM public.earnings e",
    "  CROSS JOIN bounds",
    '  WHERE COALESCE(e."commissionAmount", 0) > 0',
    '    AND (bounds."fromDate" IS NULL OR e."createdAt" >= bounds."fromDate")',
    '    AND (bounds."toDate" IS NULL OR e."createdAt" <= bounds."toDate")',
    "  UNION ALL",
    "  SELECT",
    "    'ads'::text AS source,",
    "    'ads'::text AS category,",
    "    NULL::text AS tier,",
    '    ppt."createdAt" AS "eventAt",',
    "    ppt.amount::numeric AS amount",
    "  FROM public.promote_post_transaction ppt",
    "  CROSS JOIN bounds",
    "  WHERE COALESCE(ppt.amount, 0) > 0",
    '    AND (bounds."fromDate" IS NULL OR ppt."createdAt" >= bounds."fromDate")',
    '    AND (bounds."toDate" IS NULL OR ppt."createdAt" <= bounds."toDate")',
    ")"
  ];
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

export async function getAdminAnalyticsRevenue(
  filters: AdminAnalyticsRevenueFilters = {},
  dependencies: AdminAnalyticsServiceDependencies = {}
): Promise<AdminAnalyticsRevenueResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedFilters = normalizeRevenueFilters(filters);
  const params = [normalizedFilters.from ?? null, normalizedFilters.to ?? null];
  const totalsResult = await queryFn<AdminAnalyticsRevenueTotalsRow>(
    [
      ...buildRevenueEventsCte(1, 2),
      "SELECT",
      '  COALESCE(SUM(re.amount), 0)::numeric AS "totalRevenue",',
      '  COALESCE(SUM(re.amount) FILTER (WHERE re.source = \'subscription\'), 0)::numeric AS "subscriptionRevenue",',
      '  COALESCE(SUM(re.amount) FILTER (WHERE re.source = \'commission\'), 0)::numeric AS "commissionRevenue",',
      '  COALESCE(SUM(re.amount) FILTER (WHERE re.source = \'ads\'), 0)::numeric AS "adRevenue"',
      "FROM revenue_events re"
    ].join("\n"),
    params
  );
  const totals = totalsResult.rows[0];

  if (!totals) {
    throw new Error("Admin analytics revenue query did not return a totals row");
  }

  let breakdown:
    | AdminAnalyticsRevenueBreakdownByCategoryItem[]
    | AdminAnalyticsRevenueBreakdownByTierItem[]
    | AdminAnalyticsRevenueBreakdownByPeriodItem[];

  if (normalizedFilters.groupBy === "category") {
    const breakdownResult = await queryFn<AdminAnalyticsRevenueCategoryBreakdownRow>(
      [
        ...buildRevenueEventsCte(1, 2),
        "SELECT",
        "  re.category,",
        "  COALESCE(SUM(re.amount), 0)::numeric AS revenue",
        "FROM revenue_events re",
        "GROUP BY re.category",
        "ORDER BY CASE re.category",
        "  WHEN 'subscription' THEN 1",
        "  WHEN 'commission' THEN 2",
        "  WHEN 'ads' THEN 3",
        "  ELSE 4",
        "END ASC"
      ].join("\n"),
      params
    );

    breakdown = breakdownResult.rows.map((row) => ({
      category: mapRequiredText(row.category, "category"),
      revenue: mapRevenueNumber(row.revenue, "revenue")
    }));
  } else if (normalizedFilters.groupBy === "tier") {
    const breakdownResult = await queryFn<AdminAnalyticsRevenueTierBreakdownRow>(
      [
        ...buildRevenueEventsCte(1, 2),
        "SELECT",
        "  re.tier,",
        "  COALESCE(SUM(re.amount), 0)::numeric AS revenue",
        "FROM revenue_events re",
        "WHERE re.tier IS NOT NULL",
        "GROUP BY re.tier",
        "ORDER BY SUM(re.amount) DESC, re.tier ASC"
      ].join("\n"),
      params
    );

    breakdown = breakdownResult.rows.map((row) => ({
      tier: mapRequiredText(row.tier, "tier"),
      revenue: mapRevenueNumber(row.revenue, "revenue")
    }));
  } else {
    const breakdownResult = await queryFn<AdminAnalyticsRevenuePeriodBreakdownRow>(
      [
        ...buildRevenueEventsCte(1, 2),
        "SELECT",
        '  (date_trunc(\'month\', re."eventAt" AT TIME ZONE \'UTC\') AT TIME ZONE \'UTC\') AS period,',
        "  COALESCE(SUM(re.amount), 0)::numeric AS revenue",
        "FROM revenue_events re",
        "GROUP BY 1",
        "ORDER BY 1 ASC"
      ].join("\n"),
      params
    );

    breakdown = breakdownResult.rows.map((row) => ({
      period: mapRequiredIsoString(row.period, "period"),
      revenue: mapRevenueNumber(row.revenue, "revenue")
    }));
  }

  return {
    totalRevenue: mapRevenueNumber(totals.totalRevenue, "totalRevenue"),
    subscriptionRevenue: mapRevenueNumber(
      totals.subscriptionRevenue,
      "subscriptionRevenue"
    ),
    commissionRevenue: mapRevenueNumber(
      totals.commissionRevenue,
      "commissionRevenue"
    ),
    adRevenue: mapRevenueNumber(totals.adRevenue, "adRevenue"),
    breakdown
  };
}

export async function getAdminAnalyticsTopSellers(
  filters: AdminAnalyticsTopSellersFilters = {},
  dependencies: AdminAnalyticsServiceDependencies = {}
): Promise<AdminAnalyticsTopSellersResponse> {
  const queryFn = getQueryFn(dependencies);
  const now = getNowFactory(dependencies)();
  const normalizedFilters = normalizeTopSellersFilters(filters);
  const result = await queryFn<AdminAnalyticsTopSellerRow>(
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
      "), seller_performance AS (",
      "  SELECT",
      '    u.id AS "userId",',
      "    BTRIM(u.username) AS username,",
      '    COUNT(*)::int AS "totalOrders",',
      '    COALESCE(SUM(e."grossAmount"), 0)::numeric AS "totalRevenue"',
      "  FROM public.earnings e",
      '  INNER JOIN public."user" u ON u.id = e."userId"',
      "  CROSS JOIN bounds",
      "  WHERE e.type = 'seller'",
      '    AND COALESCE(e."grossAmount", 0) > 0',
      '    AND u."userTypeId" = 2',
      "    AND u.username IS NOT NULL",
      "    AND BTRIM(u.username) <> ''",
      '    AND e."createdAt" >= bounds."fromDate"',
      '    AND e."createdAt" < bounds."toDate"',
      '  GROUP BY u.id, BTRIM(u.username)',
      "), seller_ratings AS (",
      "  SELECT",
      '    r."userId",',
      "    COALESCE(AVG(r.rating), 0)::numeric AS rating",
      "  FROM public.rating_review_seller r",
      "  WHERE r.rating IS NOT NULL",
      '  GROUP BY r."userId"',
      ")",
      "SELECT",
      "  seller_performance.username,",
      '  seller_performance."totalOrders",',
      '  seller_performance."totalRevenue",',
      "  COALESCE(seller_ratings.rating, 0)::numeric AS rating",
      "FROM seller_performance",
      'LEFT JOIN seller_ratings ON seller_ratings."userId" = seller_performance."userId"',
      'ORDER BY seller_performance."totalRevenue" DESC,',
      '  seller_performance."totalOrders" DESC,',
      "  COALESCE(seller_ratings.rating, 0) DESC,",
      "  seller_performance.username ASC",
      "LIMIT $3"
    ].join("\n"),
    [now, normalizedFilters.period, normalizedFilters.limit]
  );

  return {
    sellers: result.rows.map((seller) => ({
      username: mapRequiredText(seller.username, "username"),
      totalOrders: mapRequiredNonNegativeInteger(seller.totalOrders, "totalOrders"),
      totalRevenue: mapRequiredNumber(seller.totalRevenue, "totalRevenue"),
      rating: mapRequiredNumber(seller.rating, "rating")
    }))
  };
}

export async function getAdminAnalyticsTopProducts(
  filters: AdminAnalyticsTopProductsFilters = {},
  dependencies: AdminAnalyticsServiceDependencies = {}
): Promise<AdminAnalyticsTopProductsResponse> {
  const queryFn = getQueryFn(dependencies);
  const now = getNowFactory(dependencies)();
  const normalizedFilters = normalizeTopProductsFilters(filters);
  const result = await queryFn<AdminAnalyticsTopProductRow>(
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
      ")",
      "SELECT",
      '  c."productId" AS "productId",',
      "  COALESCE(NULLIF(BTRIM(p.name), ''), CONCAT('Product #', c.\"productId\"::text)) AS name,",
      '  COALESCE(SUM(c.quantity), 0)::int AS "totalSold",',
      '  COALESCE(SUM(COALESCE(c.amount, COALESCE(c."unitPrice", 0) * COALESCE(c.quantity, 0))), 0)::numeric AS revenue,',
      '  COALESCE(NULLIF(BTRIM(seller.username), \'\'), NULLIF(BTRIM(o."sellerUsername"), \'\'), \'Unknown seller\') AS seller',
      "FROM public.earnings e",
      "INNER JOIN public.order_tb o ON o.id = e.\"orderTbId\"",
      "INNER JOIN public.cart c ON c.id::bigint = o.\"cartId\"",
      'LEFT JOIN public.product p ON p.id::bigint = c."productId"',
      'LEFT JOIN public."user" seller ON seller.id = e."userId"',
      "CROSS JOIN bounds",
      "WHERE e.type = 'seller'",
      '  AND c."productId" IS NOT NULL',
      '  AND e."createdAt" >= bounds."fromDate"',
      '  AND e."createdAt" < bounds."toDate"',
      '  AND ($3::bigint IS NULL OR p."productCategoryId" = $3::bigint)',
      'GROUP BY c."productId", name, seller',
      'ORDER BY "totalSold" DESC, revenue DESC, name ASC, c."productId" ASC',
      "LIMIT $4"
    ].join("\n"),
    [now, normalizedFilters.period, normalizedFilters.categoryId ?? null, normalizedFilters.limit]
  );

  return {
    products: result.rows.map((product) => ({
      productId: mapRequiredNonNegativeInteger(product.productId, "productId"),
      name: mapRequiredText(product.name, "name"),
      totalSold: mapRequiredNonNegativeInteger(product.totalSold, "totalSold"),
      revenue: mapRequiredNumber(product.revenue, "revenue"),
      seller: mapRequiredText(product.seller, "seller")
    }))
  };
}
