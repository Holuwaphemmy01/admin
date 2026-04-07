import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminAccountsRouter } from "../../src/modules/admin-accounts/routes";
import { listAdminAccounts } from "../../src/modules/admin-accounts/service";

async function startTestServer(application: ReturnType<typeof express>) {
  const server = application.listen(0);

  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

function createQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: "SELECT",
    oid: 0,
    fields: [],
    rowCount: rows.length,
    rows
  };
}

function createAuthenticatedAdmin(
  overrides: Partial<AuthenticatedAdmin> = {}
): AuthenticatedAdmin {
  return {
    sub: "admin-user-id",
    scope: "admin",
    role: "super_admin",
    username: "brickpine-admin",
    emailAddress: "admin@brickpine.local",
    userTypeId: 4,
    passwordVersion: 1,
    ...overrides
  };
}

function allowAuthenticatedAdmin(admin: AuthenticatedAdmin = createAuthenticatedAdmin()): RequestHandler {
  return (request, _response, next) => {
    request.admin = admin;
    next();
  };
}

test("listAdminAccounts reads from admin_users only and maps response-safe admin summaries", async () => {
  const executedQueries: string[] = [];

  const response = await listAdminAccounts({
    queryFn: async <T extends QueryResultRow>(text: string) => {
      executedQueries.push(text);

      return createQueryResult([
        {
          id: "second-admin-id",
          username: null,
          emailAddress: "support-admin@brickpine.local",
          role: "support",
          status: "active",
          createdAt: new Date("2026-04-07T11:00:00.000Z")
        },
        {
          id: "first-admin-id",
          username: "finance-admin",
          emailAddress: "finance-admin@brickpine.local",
          role: "finance",
          status: "invited",
          createdAt: new Date("2026-04-06T09:30:00.000Z")
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(executedQueries).toHaveLength(1);
  expect(executedQueries[0]).toContain("FROM public.admin_users");
  expect(executedQueries[0]).toContain('ORDER BY au."createdAt" DESC');
  expect(executedQueries[0]).not.toContain("admin_credentials");
  expect(response).toEqual({
    admins: [
      {
        id: "second-admin-id",
        username: "support-admin@brickpine.local",
        role: "support",
        status: "active",
        createdAt: "2026-04-07T11:00:00.000Z"
      },
      {
        id: "first-admin-id",
        username: "finance-admin",
        role: "finance",
        status: "invited",
        createdAt: "2026-04-06T09:30:00.000Z"
      }
    ]
  });
});

test("GET /admin/auth/admins returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/admins`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/auth/admins returns 403 for non-super-admins and 200 for super admins", async () => {
  const forbiddenApplication = express();

  forbiddenApplication.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listAdminAccountsHandler: async () => ({
        admins: []
      })
    })
  );

  let server = await startTestServer(forbiddenApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/admins`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }

  const successApplication = express();

  successApplication.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminAccountsHandler: async () => ({
        admins: [
          {
            id: "second-admin-id",
            username: "support-admin@brickpine.local",
            role: "support",
            status: "active",
            createdAt: "2026-04-07T11:00:00.000Z"
          },
          {
            id: "first-admin-id",
            username: "finance-admin",
            role: "finance",
            status: "invited",
            createdAt: "2026-04-06T09:30:00.000Z"
          }
        ]
      })
    })
  );

  server = await startTestServer(successApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/admins`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      admins: Array<Record<string, unknown>>;
    };

    expect(payload.admins).toHaveLength(2);
    expect(Object.keys(payload.admins[0] ?? {})).toEqual([
      "id",
      "username",
      "role",
      "status",
      "createdAt"
    ]);
    expect(payload.admins[0]?.username).toBe("support-admin@brickpine.local");
    expect(payload.admins[1]?.role).toBe("finance");
  } finally {
    await server.close();
  }
});
