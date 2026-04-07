import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import { AdminUsersListFilters, AdminUsersListResponse } from "./types";

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

function getQueryFn(dependencies: AdminUsersServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function mapTextValue(value: string | null): string {
  return typeof value === "string" ? value : "";
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
