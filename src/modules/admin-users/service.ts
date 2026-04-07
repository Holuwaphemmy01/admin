import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  AdminUsersListFilters,
  AdminUsersListResponse,
  PlatformUserProfileResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminUsersServiceDependencies {
  queryFn?: QueryFunction;
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

function getQueryFn(dependencies: AdminUsersServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function mapTextValue(value: string | null): string {
  return typeof value === "string" ? value : "";
}

function mapNullableTextValue(value: string | null): string | null {
  return typeof value === "string" ? value : null;
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
  const normalizedUsername = normalizeCredentialValue(username);

  if (normalizedUsername === "") {
    throw new PlatformUserProfileValidationError("username must be a non-empty string");
  }

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
