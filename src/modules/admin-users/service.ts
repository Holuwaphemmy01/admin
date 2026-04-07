import { randomUUID } from "node:crypto";

import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import { AuthenticatedAdmin } from "../admin-auth/types";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  AdminUsersListFilters,
  AdminUsersListResponse,
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
  status: 1 | 2;
}

export class PlatformUserProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformUserProfileValidationError";
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

function normalizeRequiredUsername(
  username: string,
  ErrorType: typeof PlatformUserProfileValidationError | typeof PlatformUserSuspensionValidationError
): string {
  const normalizedUsername = normalizeCredentialValue(username);

  if (normalizedUsername === "") {
    throw new ErrorType("username must be a non-empty string");
  }

  return normalizedUsername;
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

  const normalizedComment = normalizeCredentialValue(input.comment);

  if (normalizedComment === "") {
    throw new PlatformUserSuspensionValidationError(
      "comment is required and must be a non-empty string"
    );
  }

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
