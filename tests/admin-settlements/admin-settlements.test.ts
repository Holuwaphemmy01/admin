import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminSettlementsRouter } from "../../src/modules/admin-settlements/routes";
import {
  AdminSettlementsValidationError,
  listAdminSettlements
} from "../../src/modules/admin-settlements/service";
import { AdminSettlementsListResponse } from "../../src/modules/admin-settlements/types";

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

function allowAuthenticatedAdmin(
  admin: AuthenticatedAdmin = createAuthenticatedAdmin()
): RequestHandler {
  return (request, _response, next) => {
    request.admin = admin;
    next();
  };
}

test("listAdminSettlements maps settlement rows into the admin response payload and total count", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listAdminSettlements(
    {
      page: 1,
      limit: 20
    },
    {
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        executedQueries.push({ text, params });

        if (text.includes("COUNT(*)::int AS total")) {
          return createQueryResult([
            {
              total: 2
            }
          ]) as unknown as QueryResult<T>;
        }

        return createQueryResult([
          {
            id: "2",
            username: " seller-one ",
            amount: "1500.25",
            status: 2,
            description: " Approved payout ",
            createdAt: new Date("2026-04-07T12:00:00.000Z"),
            settlementAccountId: "3"
          },
          {
            id: 1,
            username: "logistics-one",
            amount: null,
            status: 1,
            description: null,
            createdAt: new Date("2026-01-22T09:22:34.000Z"),
            settlementAccountId: null
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("FROM public.settlement s");
  expect(executedQueries[0]?.text).toContain('INNER JOIN public."user" u ON u.id = s."userId"');
  expect(executedQueries[0]?.text).toContain('s.status IN (1, 2, 3)');
  expect(executedQueries[0]?.text).toContain('ORDER BY s."createdAt" DESC, s.id DESC');
  expect(executedQueries[0]?.params).toEqual([20, 0]);
  expect(response).toEqual({
    settlements: [
      {
        id: 2,
        username: "seller-one",
        amount: 1500.25,
        status: "approved",
        description: "Approved payout",
        createdAt: "2026-04-07T12:00:00.000Z",
        settlementAccountId: 3
      },
      {
        id: 1,
        username: "logistics-one",
        amount: 0,
        status: "pending",
        description: null,
        createdAt: "2026-01-22T09:22:34.000Z",
        settlementAccountId: null
      }
    ],
    total: 2
  });
});

test("listAdminSettlements applies filters, pagination, and validation rules", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listAdminSettlements(
    {
      status: "rejected",
      username: " Seller-One ",
      page: 2,
      limit: 50
    },
    {
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        executedQueries.push({ text, params });

        if (text.includes("COUNT(*)::int AS total")) {
          return createQueryResult([
            {
              total: 0
            }
          ]) as unknown as QueryResult<T>;
        }

        return createQueryResult([]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain('s.status = $1');
  expect(executedQueries[0]?.text).toContain('LOWER(BTRIM(u.username)) = LOWER(BTRIM($2))');
  expect(executedQueries[0]?.params).toEqual([3, "Seller-One", 50, 50]);
  expect(response).toEqual({
    settlements: [],
    total: 0
  });

  await expect(
    listAdminSettlements({
      page: 0,
      limit: 20
    })
  ).rejects.toThrow(AdminSettlementsValidationError);

  await expect(
    listAdminSettlements({
      page: 1,
      limit: 0
    })
  ).rejects.toThrow("limit must be a positive integer");

  await expect(
    listAdminSettlements({
      status: "unknown" as "pending",
      page: 1,
      limit: 20
    })
  ).rejects.toThrow("status must be one of pending, approved, or rejected");
});

test("GET /admin/settlements returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/settlements",
    createAdminSettlementsRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/settlements`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/settlements returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/settlements",
    createAdminSettlementsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "finance"
        })
      ),
      listAdminSettlementsHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/settlements`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/settlements validates query params and trims the username filter", async () => {
  let server;
  const validationApplication = express();

  validationApplication.use(
    "/admin/settlements",
    createAdminSettlementsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminSettlementsHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  server = await startTestServer(validationApplication);

  try {
    let response = await fetch(`${server.baseUrl}/admin/settlements?status=invalid`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "status must be one of pending, approved, or rejected"
    });

    response = await fetch(`${server.baseUrl}/admin/settlements?page=0`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "page must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/settlements?limit=0`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "limit must be a positive integer"
    });
  } finally {
    await server.close();
  }

  const successApplication = express();

  successApplication.use(
    "/admin/settlements",
    createAdminSettlementsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminSettlementsHandler: async (
        filters
      ): Promise<AdminSettlementsListResponse> => {
        expect(filters).toEqual({
          status: "approved",
          username: "seller-one",
          page: 1,
          limit: 100
        });

        return {
          settlements: [
            {
              id: 1,
              username: "seller-one",
              amount: 100.5,
              status: "approved",
              description: "payment description",
              createdAt: "2026-01-22T09:22:34.000Z",
              settlementAccountId: 1
            }
          ],
          total: 1
        };
      }
    })
  );

  server = await startTestServer(successApplication);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/settlements?status=approved&username=%20seller-one%20&limit=999`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      settlements: [
        {
          id: 1,
          username: "seller-one",
          amount: 100.5,
          status: "approved",
          description: "payment description",
          createdAt: "2026-01-22T09:22:34.000Z",
          settlementAccountId: 1
        }
      ],
      total: 1
    });
  } finally {
    await server.close();
  }
});
