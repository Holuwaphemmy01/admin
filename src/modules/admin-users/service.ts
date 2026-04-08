import { randomUUID } from "node:crypto";

import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import { AuthenticatedAdmin } from "../admin-auth/types";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  ACTIVE_PLATFORM_USER_STATUS_CODE,
  ActivatePlatformUserResponse,
  AdminUsersStatsPeriod,
  AdminUsersStatsResponse,
  AdminUsersListFilters,
  AdminUsersListResponse,
  DEFAULT_ADMIN_USERS_STATS_PERIOD,
  DeletePlatformUserResponse,
  PlatformUserProfileResponse,
  SuspendPlatformUserResponse,
  SUSPENDED_PLATFORM_USER_STATUS_CODE
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

interface AdminUsersServiceDependencies {
  queryFn?: QueryFunction;
  runInTransaction?: RunInTransaction;
  nowFactory?: () => Date;
  uuidFactory?: () => string;
}

interface PlatformUserRow extends QueryResultRow {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
  userTypeId: 1 | 2 | 3;
  status: 1 | 2;
  createdAt: Date;
}

interface TotalCountRow extends QueryResultRow {
  total: number;
}

interface PlatformUserStatsRow extends QueryResultRow {
  totalUsers: number;
  buyers: number;
  sellers: number;
  logistics: number;
  suspended: number;
  newUsersToday: number;
}

interface PlatformUserGrowthTrendRow extends QueryResultRow {
  date: Date;
  newUsers: number;
}

interface PlatformUserProfileRow extends QueryResultRow {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
  userTypeId: 1 | 2 | 3;
  createdAt: Date;
  bio: string | null;
  profileImage: string | null;
  coverImage: string | null;
}

interface PlatformUserForUpdateRow extends QueryResultRow {
  id: number;
  username: string | null;
  emailAddress: string | null;
  userTypeId: 1 | 2 | 3;
  status: 1 | 2;
}

interface UserDeleteTarget {
  tableName: string;
  columnName: string;
}

const PLATFORM_USER_DELETE_BY_ID_TARGETS: readonly UserDeleteTarget[] = [
  { tableName: "billing_address", columnName: "userId" },
  { tableName: "business_detail", columnName: "userId" },
  { tableName: "cart", columnName: "userId" },
  { tableName: "comment_product_post", columnName: "userId" },
  { tableName: "comment_product_post_reply", columnName: "userId" },
  { tableName: "comment_social_post", columnName: "userId" },
  { tableName: "comment_social_post_reply", columnName: "userId" },
  { tableName: "customer_feedback", columnName: "userId" },
  { tableName: "delivery", columnName: "buyerUserId" },
  { tableName: "delivery_bid", columnName: "userId" },
  { tableName: "discount", columnName: "userId" },
  { tableName: "earnings", columnName: "userId" },
  { tableName: "feed_interaction", columnName: "userId" },
  { tableName: "follow", columnName: "userId" },
  { tableName: "kyc", columnName: "userId" },
  { tableName: "logistic", columnName: "userId" },
  { tableName: "order_tb", columnName: "userId" },
  { tableName: "otp", columnName: "userId" },
  { tableName: "pay_for_me_link", columnName: "userId" },
  { tableName: "pay_for_me_transaction", columnName: "userId" },
  { tableName: "product", columnName: "userId" },
  { tableName: "product_inventory", columnName: "userId" },
  { tableName: "product_post", columnName: "userId" },
  { tableName: "promote_post_campaign", columnName: "userId" },
  { tableName: "promote_post_campaign_stats", columnName: "userId" },
  { tableName: "promote_post_click", columnName: "userId" },
  { tableName: "promote_post_engagement", columnName: "userId" },
  { tableName: "promote_post_impression", columnName: "userId" },
  { tableName: "promote_post_transaction", columnName: "userId" },
  { tableName: "rating_review_buyer", columnName: "userId" },
  { tableName: "rating_review_logistics", columnName: "userId" },
  { tableName: "rating_review_product", columnName: "userId" },
  { tableName: "rating_review_seller", columnName: "userId" },
  { tableName: "referral_code", columnName: "userId" },
  { tableName: "referral_earning", columnName: "referrerUserId" },
  { tableName: "referral_earning", columnName: "referredUserId" },
  { tableName: "referral_relation", columnName: "referrerUserId" },
  { tableName: "referral_relation", columnName: "referredUserId" },
  { tableName: "rewards", columnName: "userId" },
  { tableName: "rewards_transaction", columnName: "userId" },
  { tableName: "settlement", columnName: "userId" },
  { tableName: "settlement_account", columnName: "userId" },
  { tableName: "social_post", columnName: "userId" },
  { tableName: "support_ticket", columnName: "userId" },
  { tableName: "transaction_pin", columnName: "userId" },
  { tableName: "user_auth", columnName: "userId" },
  { tableName: "user_bio", columnName: "userId" },
  { tableName: "user_interest", columnName: "userId" },
  { tableName: "user_login_tracker", columnName: "userId" },
  { tableName: "user_notification", columnName: "userId" },
  { tableName: "user_profile_cover_img", columnName: "userId" },
  { tableName: "user_profile_img", columnName: "userId" },
  { tableName: "user_reward", columnName: "userId" },
  { tableName: "user_subscription", columnName: "userId" },
  { tableName: "wallet", columnName: "userId" },
  { tableName: "wallet_transaction", columnName: "userId" },
  { tableName: "wishlist", columnName: "userId" }
] as const;

const PLATFORM_USER_DELETE_BY_STRING_ID_TARGETS: readonly UserDeleteTarget[] = [
  { tableName: "searchHistory", columnName: "user_id" }
] as const;

const PLATFORM_USER_DELETE_BY_USERNAME_TARGETS: readonly UserDeleteTarget[] = [
  { tableName: "chat_conversation_list", columnName: "username" },
  { tableName: "chat_user_socket_id", columnName: "username" },
  { tableName: "customer_management", columnName: "username" },
  { tableName: "customer_management", columnName: "customerUsername" },
  { tableName: "delivery_bid", columnName: "logisticUsername" },
  { tableName: "feed_interaction", columnName: "username" },
  { tableName: "notification_general", columnName: "username" },
  { tableName: "order_tb", columnName: "sellerUsername" },
  { tableName: "order_tb", columnName: "logisticUsername" },
  { tableName: "rating_review_to_send", columnName: "buyerUsername" },
  { tableName: "rating_review_to_send", columnName: "sellerUsername" },
  { tableName: "rating_review_to_send", columnName: "logisticUsername" }
] as const;

export class PlatformUserProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserProfileValidationError";
  }
}

export class PlatformUserStatsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserStatsValidationError";
  }
}

export class PlatformUserProfileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserProfileNotFoundError";
  }
}

export class PlatformUserProfileConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserProfileConflictError";
  }
}

export class PlatformUserSuspensionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserSuspensionValidationError";
  }
}

export class PlatformUserSuspensionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserSuspensionNotFoundError";
  }
}

export class PlatformUserSuspensionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserSuspensionConflictError";
  }
}

export class PlatformUserActivationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserActivationValidationError";
  }
}

export class PlatformUserActivationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserActivationNotFoundError";
  }
}

export class PlatformUserActivationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserActivationConflictError";
  }
}

export class PlatformUserDeletionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserDeletionValidationError";
  }
}

export class PlatformUserDeletionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserDeletionNotFoundError";
  }
}

export class PlatformUserDeletionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserDeletionConflictError";
  }
}

type MessageErrorConstructor = new (message: string) => Error;

function getQueryFn(dependencies: AdminUsersServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getRunInTransaction(
  dependencies: AdminUsersServiceDependencies = {}
): RunInTransaction {
  return dependencies.runInTransaction ?? withTransaction;
}

function getNowFactory(dependencies: AdminUsersServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function getUuidFactory(dependencies: AdminUsersServiceDependencies = {}): () => string {
  return dependencies.uuidFactory ?? randomUUID;
}

function mapTextValue(value: string | null): string {
  return typeof value === "string" ? value : "";
}

function mapNullableTextValue(value: string | null): string | null {
  return typeof value === "string" ? value : null;
}

function mapCountValue(value: number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function normalizeRequiredUsername(
  username: string,
  ErrorType: MessageErrorConstructor
): string {
  const normalizedUsername = normalizeCredentialValue(username);

  if (normalizedUsername === "") {
    throw new ErrorType("username must be a non-empty string");
  }

  return normalizedUsername;
}

function normalizeRequiredComment(comment: string, ErrorType: MessageErrorConstructor): string {
  const normalizedComment = normalizeCredentialValue(comment);

  if (normalizedComment === "") {
    throw new ErrorType("comment is required and must be a non-empty string");
  }

  return normalizedComment;
}

function normalizeRequiredReason(reason: string, ErrorType: MessageErrorConstructor): string {
  const normalizedReason = normalizeCredentialValue(reason);

  if (normalizedReason === "") {
    throw new ErrorType("reason is required and must be a non-empty string");
  }

  return normalizedReason;
}

function normalizeStatsPeriod(
  period: string | undefined,
  ErrorType: MessageErrorConstructor
): AdminUsersStatsPeriod {
  if (period === undefined) {
    return DEFAULT_ADMIN_USERS_STATS_PERIOD;
  }

  const normalizedPeriod = normalizeCredentialValue(period).toLowerCase();

  if (
    normalizedPeriod !== "daily" &&
    normalizedPeriod !== "weekly" &&
    normalizedPeriod !== "monthly"
  ) {
    throw new ErrorType("period must be one of daily, weekly, monthly");
  }

  return normalizedPeriod;
}

function normalizeOptionalComment(
  comment: string | undefined,
  ErrorType: MessageErrorConstructor
): string | null {
  if (comment === undefined) {
    return null;
  }

  const normalizedComment = normalizeCredentialValue(comment);

  if (normalizedComment === "") {
    throw new ErrorType("comment must be a non-empty string when provided");
  }

  return normalizedComment;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

async function deleteUserLinkedRowsById(
  client: TransactionClient,
  userId: number
): Promise<void> {
  for (const target of PLATFORM_USER_DELETE_BY_ID_TARGETS) {
    await client.query(
      `DELETE FROM public.${quoteIdentifier(target.tableName)} WHERE ${quoteIdentifier(target.columnName)} = $1`,
      [userId]
    );
  }

  for (const target of PLATFORM_USER_DELETE_BY_STRING_ID_TARGETS) {
    await client.query(
      `DELETE FROM public.${quoteIdentifier(target.tableName)} WHERE ${quoteIdentifier(target.columnName)} = $1`,
      [String(userId)]
    );
  }
}

async function deleteUserLinkedRowsByUsername(
  client: TransactionClient,
  username: string
): Promise<void> {
  for (const target of PLATFORM_USER_DELETE_BY_USERNAME_TARGETS) {
    await client.query(
      `DELETE FROM public.${quoteIdentifier(target.tableName)} WHERE LOWER(${quoteIdentifier(target.columnName)}) = LOWER($1)`,
      [username]
    );
  }
}

function buildUserFilters(filters: AdminUsersListFilters): { whereSql: string; params: unknown[] } {
  const clauses = ['u."userTypeId" IN (1, 2, 3)'];
  const params: unknown[] = [];

  if (typeof filters.userTypeId === "number") {
    params.push(filters.userTypeId);
    clauses.push(`u."userTypeId" = $${params.length}`);
  }

  if (typeof filters.status === "number") {
    params.push(filters.status);
    clauses.push(`u.status = $${params.length}`);
  }

  if (filters.from instanceof Date) {
    params.push(filters.from);
    clauses.push(`u."createdAt" >= $${params.length}`);
  }

  if (filters.to instanceof Date) {
    params.push(filters.to);
    clauses.push(`u."createdAt" <= $${params.length}`);
  }

  return {
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params
  };
}

function buildGrowthTrendQuery(period: AdminUsersStatsPeriod): string {
  switch (period) {
    case "daily":
      return [
        "WITH series AS (",
        "  SELECT generate_series(",
        "    date_trunc('day', $1::timestamptz) - INTERVAL '6 days',",
        "    date_trunc('day', $1::timestamptz),",
        "    INTERVAL '1 day'",
        '  ) AS "date"',
        "), user_counts AS (",
        "  SELECT",
        '    date_trunc(\'day\', u."createdAt") AS "date",',
        '    COUNT(*)::int AS "newUsers"',
        '  FROM public."user" u',
        '  WHERE u."userTypeId" IN (1, 2, 3)',
        "    AND u.\"createdAt\" >= date_trunc('day', $1::timestamptz) - INTERVAL '6 days'",
        "    AND u.\"createdAt\" < date_trunc('day', $1::timestamptz) + INTERVAL '1 day'",
        '  GROUP BY "date"',
        ")",
        "SELECT",
        '  series."date",',
        '  COALESCE(user_counts."newUsers", 0)::int AS "newUsers"',
        "FROM series",
        'LEFT JOIN user_counts ON user_counts."date" = series."date"',
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
        "), user_counts AS (",
        "  SELECT",
        '    date_trunc(\'week\', u."createdAt") AS "date",',
        '    COUNT(*)::int AS "newUsers"',
        '  FROM public."user" u',
        '  WHERE u."userTypeId" IN (1, 2, 3)',
        "    AND u.\"createdAt\" >= date_trunc('week', $1::timestamptz) - INTERVAL '7 weeks'",
        "    AND u.\"createdAt\" < date_trunc('week', $1::timestamptz) + INTERVAL '1 week'",
        '  GROUP BY "date"',
        ")",
        "SELECT",
        '  series."date",',
        '  COALESCE(user_counts."newUsers", 0)::int AS "newUsers"',
        "FROM series",
        'LEFT JOIN user_counts ON user_counts."date" = series."date"',
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
        "), user_counts AS (",
        "  SELECT",
        '    date_trunc(\'month\', u."createdAt") AS "date",',
        '    COUNT(*)::int AS "newUsers"',
        '  FROM public."user" u',
        '  WHERE u."userTypeId" IN (1, 2, 3)',
        "    AND u.\"createdAt\" >= date_trunc('month', $1::timestamptz) - INTERVAL '11 months'",
        "    AND u.\"createdAt\" < date_trunc('month', $1::timestamptz) + INTERVAL '1 month'",
        '  GROUP BY "date"',
        ")",
        "SELECT",
        '  series."date",',
        '  COALESCE(user_counts."newUsers", 0)::int AS "newUsers"',
        "FROM series",
        'LEFT JOIN user_counts ON user_counts."date" = series."date"',
        'ORDER BY series."date" ASC'
      ].join("\n");
  }
}

export async function listPlatformUsers(
  filters: AdminUsersListFilters,
  dependencies: AdminUsersServiceDependencies = {}
): Promise<AdminUsersListResponse> {
  const queryFn = getQueryFn(dependencies);
  const { whereSql, params } = buildUserFilters(filters);
  const paginationParams = [...params, filters.limit, (filters.page - 1) * filters.limit];

  const usersResult = await queryFn<PlatformUserRow>(
    [
      "SELECT",
      '  u.username, u."firstName", u."lastName", u."emailAddress", u."phoneNumber",',
      '  u."userTypeId", u.status, u."createdAt"',
      'FROM public."user" u',
      whereSql,
      'ORDER BY u."createdAt" DESC',
      `LIMIT $${params.length + 1}`,
      `OFFSET $${params.length + 2}`
    ].join("\n"),
    paginationParams
  );

  const totalResult = await queryFn<TotalCountRow>(
    [
      "SELECT",
      "  COUNT(*)::int AS total",
      'FROM public."user" u',
      whereSql
    ].join("\n"),
    params
  );

  return {
    users: usersResult.rows.map((user) => ({
      username: mapTextValue(user.username),
      firstName: mapTextValue(user.firstName),
      lastName: mapTextValue(user.lastName),
      emailAddress: mapTextValue(user.emailAddress),
      phoneNumber: mapTextValue(user.phoneNumber),
      userTypeId: user.userTypeId,
      status: user.status,
      createdAt: user.createdAt.toISOString()
    })),
    total: Number(totalResult.rows[0]?.total ?? 0)
  };
}

export async function getPlatformUserStats(
  period: string | undefined,
  dependencies: AdminUsersServiceDependencies = {}
): Promise<AdminUsersStatsResponse> {
  const normalizedPeriod = normalizeStatsPeriod(period, PlatformUserStatsValidationError);
  const queryFn = getQueryFn(dependencies);
  const now = getNowFactory(dependencies)();

  const statsResult = await queryFn<PlatformUserStatsRow>(
    [
      "SELECT",
      '  COUNT(*)::int AS "totalUsers",',
      '  COUNT(*) FILTER (WHERE u."userTypeId" = 1)::int AS buyers,',
      '  COUNT(*) FILTER (WHERE u."userTypeId" = 2)::int AS sellers,',
      '  COUNT(*) FILTER (WHERE u."userTypeId" = 3)::int AS logistics,',
      "  COUNT(*) FILTER (WHERE u.status = 2)::int AS suspended,",
      '  COUNT(*) FILTER (',
      "    WHERE u.\"createdAt\" >= date_trunc('day', $1::timestamptz)",
      "      AND u.\"createdAt\" < date_trunc('day', $1::timestamptz) + INTERVAL '1 day'",
      '  )::int AS "newUsersToday"',
      'FROM public."user" u',
      'WHERE u."userTypeId" IN (1, 2, 3)'
    ].join("\n"),
    [now]
  );

  const growthTrendResult = await queryFn<PlatformUserGrowthTrendRow>(
    buildGrowthTrendQuery(normalizedPeriod),
    [now]
  );

  const stats = statsResult.rows[0];

  return {
    totalUsers: mapCountValue(stats?.totalUsers),
    buyers: mapCountValue(stats?.buyers),
    sellers: mapCountValue(stats?.sellers),
    logistics: mapCountValue(stats?.logistics),
    suspended: mapCountValue(stats?.suspended),
    newUsersToday: mapCountValue(stats?.newUsersToday),
    growthTrend: growthTrendResult.rows.map((point) => ({
      date: point.date.toISOString().slice(0, 10),
      newUsers: mapCountValue(point.newUsers)
    }))
  };
}

export async function getPlatformUserProfile(
  username: string,
  dependencies: AdminUsersServiceDependencies = {}
): Promise<PlatformUserProfileResponse> {
  const normalizedUsername = normalizeRequiredUsername(
    username,
    PlatformUserProfileValidationError
  );

  const queryFn = getQueryFn(dependencies);
  const result = await queryFn<PlatformUserProfileRow>(
    [
      "SELECT",
      '  u.username, u."firstName", u."lastName", u."emailAddress", u."phoneNumber",',
      '  u."userTypeId", u."createdAt",',
      '  ub.description AS bio,',
      '  upi."profileImg" AS "profileImage",',
      '  upc."coverImg" AS "coverImage"',
      'FROM public."user" u',
      'LEFT JOIN public.user_bio ub ON ub."userId" = u.id::bigint AND ub.status = 1',
      'LEFT JOIN public.user_profile_img upi ON upi."userId" = u.id::bigint AND upi.status = 1',
      'LEFT JOIN public.user_profile_cover_img upc ON upc."userId" = u.id::bigint AND upc.status = \'1\'',
      'WHERE u."userTypeId" IN (1, 2, 3) AND LOWER(u.username) = LOWER($1)',
      'ORDER BY u."createdAt" DESC',
      "LIMIT 2"
    ].join("\n"),
    [normalizedUsername]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new PlatformUserProfileNotFoundError("User profile not found");
  }

  if ((result.rowCount ?? 0) > 1) {
    throw new PlatformUserProfileConflictError("Multiple users match the provided username");
  }

  const user = result.rows[0];

  return {
    username: mapTextValue(user.username),
    firstName: mapTextValue(user.firstName),
    lastName: mapTextValue(user.lastName),
    emailAddress: mapTextValue(user.emailAddress),
    phoneNumber: mapTextValue(user.phoneNumber),
    userTypeId: user.userTypeId,
    createdAt: user.createdAt.toISOString(),
    social_posts: {
      total: 0,
      latestCreatedAt: null
    },
    follow: {
      followers: 0,
      following: 0
    },
    user_bio: {
      bio: mapNullableTextValue(user.bio),
      profileImage: mapNullableTextValue(user.profileImage),
      coverImage: mapNullableTextValue(user.coverImage)
    }
  };
}

interface SuspendPlatformUserInput {
  username: string;
  status: number;
  comment: string;
  suspendedByAdmin: AuthenticatedAdmin;
}

export async function suspendPlatformUser(
  input: SuspendPlatformUserInput,
  dependencies: AdminUsersServiceDependencies = {}
): Promise<SuspendPlatformUserResponse> {
  const normalizedUsername = normalizeRequiredUsername(
    input.username,
    PlatformUserSuspensionValidationError
  );

  if (input.status !== SUSPENDED_PLATFORM_USER_STATUS_CODE) {
    throw new PlatformUserSuspensionValidationError("status must be 2");
  }

  const normalizedComment = normalizeRequiredComment(
    input.comment,
    PlatformUserSuspensionValidationError
  );

  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const uuidFactory = getUuidFactory(dependencies);

  await runInTransaction(async (client) => {
    const targetUserResult = await client.query<PlatformUserForUpdateRow>(
      [
        "SELECT",
        "  u.id, u.status",
        'FROM public."user" u',
        'WHERE u."userTypeId" IN (1, 2, 3) AND LOWER(u.username) = LOWER($1)',
        'ORDER BY u."createdAt" DESC',
        "LIMIT 2",
        "FOR UPDATE"
      ].join("\n"),
      [normalizedUsername]
    );

    if ((targetUserResult.rowCount ?? 0) === 0) {
      throw new PlatformUserSuspensionNotFoundError("User account not found");
    }

    if ((targetUserResult.rowCount ?? 0) > 1) {
      throw new PlatformUserSuspensionConflictError(
        "Multiple users match the provided username"
      );
    }

    const targetUser = targetUserResult.rows[0];

    if (targetUser.status === SUSPENDED_PLATFORM_USER_STATUS_CODE) {
      throw new PlatformUserSuspensionConflictError("User account is already suspended");
    }

    const timestamp = nowFactory();

    await client.query(
      [
        'UPDATE public."user"',
        "SET status = $1,",
        '    "updatedAt" = $2',
        "WHERE id = $3"
      ].join("\n"),
      [SUSPENDED_PLATFORM_USER_STATUS_CODE, timestamp, targetUser.id]
    );

    await client.query(
      [
        "INSERT INTO public.user_access_audit_logs (",
        '  id, "targetUserId", "actedByAdminUserId", action, "previousStatus", "nextStatus", comment, "createdAt"',
        ") VALUES (",
        "  $1, $2, $3, $4, $5, $6, $7, $8",
        ")"
      ].join("\n"),
      [
        uuidFactory(),
        targetUser.id,
        input.suspendedByAdmin.sub,
        "suspend_account",
        targetUser.status,
        SUSPENDED_PLATFORM_USER_STATUS_CODE,
        normalizedComment,
        timestamp
      ]
    );
  });

  return {
    message: "Account successfully deactivated"
  };
}

interface ActivatePlatformUserInput {
  username: string;
  status: number;
  comment?: string;
  activatedByAdmin: AuthenticatedAdmin;
}

export async function activatePlatformUser(
  input: ActivatePlatformUserInput,
  dependencies: AdminUsersServiceDependencies = {}
): Promise<ActivatePlatformUserResponse> {
  const normalizedUsername = normalizeRequiredUsername(
    input.username,
    PlatformUserActivationValidationError
  );

  if (input.status !== ACTIVE_PLATFORM_USER_STATUS_CODE) {
    throw new PlatformUserActivationValidationError("status must be 1");
  }

  const normalizedComment = normalizeOptionalComment(
    input.comment,
    PlatformUserActivationValidationError
  );

  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const uuidFactory = getUuidFactory(dependencies);

  await runInTransaction(async (client) => {
    const targetUserResult = await client.query<PlatformUserForUpdateRow>(
      [
        "SELECT",
        "  u.id, u.status",
        'FROM public."user" u',
        'WHERE u."userTypeId" IN (1, 2, 3) AND LOWER(u.username) = LOWER($1)',
        'ORDER BY u."createdAt" DESC',
        "LIMIT 2",
        "FOR UPDATE"
      ].join("\n"),
      [normalizedUsername]
    );

    if ((targetUserResult.rowCount ?? 0) === 0) {
      throw new PlatformUserActivationNotFoundError("User account not found");
    }

    if ((targetUserResult.rowCount ?? 0) > 1) {
      throw new PlatformUserActivationConflictError(
        "Multiple users match the provided username"
      );
    }

    const targetUser = targetUserResult.rows[0];

    if (targetUser.status === ACTIVE_PLATFORM_USER_STATUS_CODE) {
      throw new PlatformUserActivationConflictError("User account is already active");
    }

    const timestamp = nowFactory();

    await client.query(
      [
        'UPDATE public."user"',
        "SET status = $1,",
        '    "updatedAt" = $2',
        "WHERE id = $3"
      ].join("\n"),
      [ACTIVE_PLATFORM_USER_STATUS_CODE, timestamp, targetUser.id]
    );

    await client.query(
      [
        "INSERT INTO public.user_access_audit_logs (",
        '  id, "targetUserId", "actedByAdminUserId", action, "previousStatus", "nextStatus", comment, "createdAt"',
        ") VALUES (",
        "  $1, $2, $3, $4, $5, $6, $7, $8",
        ")"
      ].join("\n"),
      [
        uuidFactory(),
        targetUser.id,
        input.activatedByAdmin.sub,
        "reactivate_account",
        targetUser.status,
        ACTIVE_PLATFORM_USER_STATUS_CODE,
        normalizedComment,
        timestamp
      ]
    );
  });

  return {
    message: "Account successfully reactivated"
  };
}

interface DeletePlatformUserInput {
  username: string;
  reason: string;
  deletedByAdmin: AuthenticatedAdmin;
}

export async function deletePlatformUser(
  input: DeletePlatformUserInput,
  dependencies: AdminUsersServiceDependencies = {}
): Promise<DeletePlatformUserResponse> {
  const normalizedUsername = normalizeRequiredUsername(
    input.username,
    PlatformUserDeletionValidationError
  );
  const normalizedReason = normalizeRequiredReason(
    input.reason,
    PlatformUserDeletionValidationError
  );

  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const uuidFactory = getUuidFactory(dependencies);

  await runInTransaction(async (client) => {
    const targetUserResult = await client.query<PlatformUserForUpdateRow>(
      [
        "SELECT",
        '  u.id, u.username, u."emailAddress", u."userTypeId", u.status',
        'FROM public."user" u',
        'WHERE u."userTypeId" IN (1, 2, 3) AND LOWER(u.username) = LOWER($1)',
        'ORDER BY u."createdAt" DESC',
        "LIMIT 2",
        "FOR UPDATE"
      ].join("\n"),
      [normalizedUsername]
    );

    if ((targetUserResult.rowCount ?? 0) === 0) {
      throw new PlatformUserDeletionNotFoundError("User account not found");
    }

    if ((targetUserResult.rowCount ?? 0) > 1) {
      throw new PlatformUserDeletionConflictError(
        "Multiple users match the provided username"
      );
    }

    const targetUser = targetUserResult.rows[0];
    const timestamp = nowFactory();
    const canonicalUsername =
      typeof targetUser.username === "string" && targetUser.username.trim() !== ""
        ? targetUser.username
        : normalizedUsername;
    const emailAddress =
      typeof targetUser.emailAddress === "string" ? targetUser.emailAddress : null;

    await deleteUserLinkedRowsByUsername(client, canonicalUsername);
    await deleteUserLinkedRowsById(client, targetUser.id);

    await client.query('DELETE FROM public."user" WHERE id = $1', [targetUser.id]);

    await client.query(
      [
        "INSERT INTO public.user_deletion_audit_logs (",
        '  id, "deletedUserId", "deletedUsername", "deletedEmailAddress", "deletedUserTypeId", "actedByAdminUserId", reason, "createdAt"',
        ") VALUES (",
        "  $1, $2, $3, $4, $5, $6, $7, $8",
        ")"
      ].join("\n"),
      [
        uuidFactory(),
        targetUser.id,
        canonicalUsername,
        emailAddress,
        targetUser.userTypeId,
        input.deletedByAdmin.sub,
        normalizedReason,
        timestamp
      ]
    );
  });

  return {
    message: "User permanently deleted"
  };
}
