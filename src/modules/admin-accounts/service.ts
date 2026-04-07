import { randomUUID } from "node:crypto";

import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import { normalizeCredentialValue, resolveAdminUsername } from "../admin-auth/utils";
import { AdminRole, AdminStatus } from "../admin/types";
import {
  AdminAccountListResponse,
  AdminRevokeRequest,
  AdminRevokeResponse
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

interface AdminAccountsServiceDependencies {
  queryFn?: QueryFunction;
  runInTransaction?: RunInTransaction;
  nowFactory?: () => Date;
  uuidFactory?: () => string;
}

interface AdminAccountRow extends QueryResultRow {
  id: string;
  username: string | null;
  emailAddress: string;
  role: AdminRole;
  status: AdminStatus;
  createdAt: Date;
}

interface AdminAccountForUpdateRow extends QueryResultRow {
  id: string;
  role: AdminRole;
  status: AdminStatus;
}

interface LockedSuperAdminRow extends QueryResultRow {
  id: string;
}

export class AdminAccountValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAccountValidationError";
  }
}

export class AdminAccountNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAccountNotFoundError";
  }
}

export class AdminAccountConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAccountConflictError";
  }
}

function getQueryFn(dependencies: AdminAccountsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getRunInTransaction(
  dependencies: AdminAccountsServiceDependencies = {}
): RunInTransaction {
  return dependencies.runInTransaction ?? withTransaction;
}

function getNowFactory(dependencies: AdminAccountsServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function getUuidFactory(dependencies: AdminAccountsServiceDependencies = {}): () => string {
  return dependencies.uuidFactory ?? randomUUID;
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

export async function revokeAdminAccess(
  input: AdminRevokeRequest,
  dependencies: AdminAccountsServiceDependencies = {}
): Promise<AdminRevokeResponse> {
  if (!isValidUuid(input.targetAdminId)) {
    throw new AdminAccountValidationError("id must be a valid UUID");
  }

  const normalizedReason =
    typeof input.reason === "string" ? normalizeCredentialValue(input.reason) : null;

  if (input.reason !== undefined && normalizedReason === "") {
    throw new AdminAccountValidationError("reason must be a non-empty string when provided");
  }

  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const uuidFactory = getUuidFactory(dependencies);

  await runInTransaction(async (client) => {
    const targetResult = await client.query<AdminAccountForUpdateRow>(
      [
        "SELECT",
        "  au.id, au.role, au.status",
        "FROM public.admin_users au",
        "WHERE au.id = $1",
        "FOR UPDATE"
      ].join("\n"),
      [input.targetAdminId]
    );

    const targetAdmin = targetResult.rows[0];

    if (!targetAdmin) {
      throw new AdminAccountNotFoundError("Admin account not found");
    }

    if (targetAdmin.status === "revoked") {
      throw new AdminAccountConflictError("Admin access has already been revoked");
    }

    if (targetAdmin.id === input.revokedByAdmin.sub) {
      throw new AdminAccountConflictError("You cannot revoke your own admin access");
    }

    if (targetAdmin.role === "super_admin" && targetAdmin.status === "active") {
      const activeSuperAdminResult = await client.query<LockedSuperAdminRow>(
        [
          "SELECT id",
          "FROM public.admin_users",
          "WHERE role = $1 AND status = $2",
          "FOR UPDATE"
        ].join("\n"),
        ["super_admin", "active"]
      );

      if ((activeSuperAdminResult.rowCount ?? 0) <= 1) {
        throw new AdminAccountConflictError("Cannot revoke the last active super admin");
      }
    }

    const timestamp = nowFactory();

    await client.query(
      [
        "UPDATE public.admin_users",
        "SET status = $1,",
        '    "updatedAt" = $2',
        "WHERE id = $3"
      ].join("\n"),
      ["revoked", timestamp, targetAdmin.id]
    );

    await client.query(
      [
        "INSERT INTO public.admin_access_audit_logs (",
        '  id, "targetAdminUserId", "actedByAdminUserId", action, "previousStatus", "nextStatus", reason, "createdAt"',
        ") VALUES (",
        "  $1, $2, $3, $4, $5, $6, $7, $8",
        ")"
      ].join("\n"),
      [
        uuidFactory(),
        targetAdmin.id,
        input.revokedByAdmin.sub,
        "revoke_access",
        targetAdmin.status,
        "revoked",
        normalizedReason,
        timestamp
      ]
    );
  });

  return {
    message: "Admin access revoked"
  };
}
