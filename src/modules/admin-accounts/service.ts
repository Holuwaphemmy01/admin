import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import { resolveAdminUsername } from "../admin-auth/utils";
import { AdminRole, AdminStatus } from "../admin/types";
import { AdminAccountListResponse } from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminAccountsServiceDependencies {
  queryFn?: QueryFunction;
}

interface AdminAccountRow extends QueryResultRow {
  id: string;
  username: string | null;
  emailAddress: string;
  role: AdminRole;
  status: AdminStatus;
  createdAt: Date;
}

function getQueryFn(dependencies: AdminAccountsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

export async function listAdminAccounts(
  dependencies: AdminAccountsServiceDependencies = {}
): Promise<AdminAccountListResponse> {
  const queryFn = getQueryFn(dependencies);
  const result = await queryFn<AdminAccountRow>(
    [
      "SELECT",
      '  au.id, au.username, au."emailAddress", au.role, au.status, au."createdAt"',
      "FROM public.admin_users au",
      'ORDER BY au."createdAt" DESC'
    ].join("\n")
  );

  return {
    admins: result.rows.map((admin) => ({
      id: admin.id,
      username: resolveAdminUsername(admin.username, admin.emailAddress),
      role: admin.role,
      status: admin.status,
      createdAt: admin.createdAt.toISOString()
    }))
  };
}
