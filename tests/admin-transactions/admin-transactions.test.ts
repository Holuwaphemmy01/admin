import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminTransactionsRouter } from "../../src/modules/admin-transactions/routes";
import {
  AdminTransactionsValidationError,
  listAdminTransactions
} from "../../src/modules/admin-transactions/service";
import { AdminTransactionsListResponse } from "../../src/modules/admin-transactions/types";

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

test("listAdminTransactions maps transaction rows into the admin response payload and total count", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listAdminTransactions(
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
            id: 173,
            userId: "25",
            amount: 10403.01,
            currency: "NGN",
            transactionId: "HOLD:X0i2sZMEkPwkh45t:DELIVERY:10115926",
            transactionType: 2,
            description: "Checkout hold for delivery funds",
            status: 1,
            createdAt: new Date("2026-03-24T20:47:55.000Z")
          },
          {
            id: 1,
            userId: "3",
            amount: "5000",
            currency: null,
            transactionId: null,
            transactionType: null,
            description: null,
            status: "1",
            createdAt: new Date("2025-10-13T18:09:14.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("FROM public.wallet_transaction wt");
  expect(executedQueries[0]?.text).toContain('ORDER BY wt."createdAt" DESC, wt.id DESC');
  expect(executedQueries[0]?.params).toEqual([20, 0]);
  expect(response).toEqual({
    transactions: [
      {
        id: 173,
        userId: 25,
        amount: 10403.01,
        currency: "NGN",
        transactionId: "HOLD:X0i2sZMEkPwkh45t:DELIVERY:10115926",
        transactionType: "debit",
        description: "Checkout hold for delivery funds",
        status: 1,
        createdAt: "2026-03-24T20:47:55.000Z"
      },
      {
        id: 1,
        userId: 3,
        amount: 5000,
        currency: "NGN",
        transactionId: null,
        transactionType: "credit",
        description: null,
        status: 1,
        createdAt: "2025-10-13T18:09:14.000Z"
      }
    ],
    total: 2
  });
});

test("listAdminTransactions applies filters and rejects invalid filter values", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  const from = new Date("2026-03-01T00:00:00.000Z");
  const to = new Date("2026-03-31T23:59:59.000Z");

  await listAdminTransactions(
    {
      userId: 25,
      transactionType: "debit",
      from,
      to,
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

  expect(executedQueries[0]?.text).toContain('wt."userId" = $1');
  expect(executedQueries[0]?.text).toContain('wt."transactionType" = $2');
  expect(executedQueries[0]?.text).toContain('wt."createdAt" >= $3');
  expect(executedQueries[0]?.text).toContain('wt."createdAt" <= $4');
  expect(executedQueries[0]?.params).toEqual([25, 2, from, to, 50, 50]);

  await expect(
    listAdminTransactions({
      page: 0,
      limit: 20
    })
  ).rejects.toThrow(AdminTransactionsValidationError);

  await expect(
    listAdminTransactions({
      page: 1,
      limit: 0
    })
  ).rejects.toThrow(AdminTransactionsValidationError);

  await expect(
    listAdminTransactions({
      userId: 0,
      page: 1,
      limit: 20
    })
  ).rejects.toThrow("userId must be a positive integer");

  await expect(
    listAdminTransactions({
      transactionType: "hold" as "credit",
      page: 1,
      limit: 20
    })
  ).rejects.toThrow("transactionType must be one of credit or debit");

  await expect(
    listAdminTransactions({
      page: 1,
      limit: 20,
      from: new Date("2026-04-01T00:00:00.000Z"),
      to: new Date("2026-03-01T00:00:00.000Z")
    })
  ).rejects.toThrow("from must be less than or equal to to");
});

test("GET /admin/transactions returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/transactions",
    createAdminTransactionsRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/transactions`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/transactions returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/transactions",
    createAdminTransactionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listAdminTransactionsHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/transactions`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/transactions validates query parameters and maps service validation errors to 400", async () => {
  let server;
  const validationApplication = express();

  validationApplication.use(
    "/admin/transactions",
    createAdminTransactionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminTransactionsHandler: async () => {
        throw new Error("This handler should not be called when query validation fails");
      }
    })
  );

  server = await startTestServer(validationApplication);

  try {
    let response = await fetch(`${server.baseUrl}/admin/transactions?userId=abc`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "userId must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/transactions?transactionType=hold`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "transactionType must be one of credit or debit"
    });

    response = await fetch(`${server.baseUrl}/admin/transactions?from=nope`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "from must be a valid ISO 8601 datetime"
    });

    response = await fetch(
      `${server.baseUrl}/admin/transactions?from=2026-04-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "from must be less than or equal to to"
    });
  } finally {
    await server.close();
  }

  const badRequestApplication = express();

  badRequestApplication.use(
    "/admin/transactions",
    createAdminTransactionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminTransactionsHandler: async () => {
        throw new AdminTransactionsValidationError("transactionType must be one of credit or debit");
      }
    })
  );

  server = await startTestServer(badRequestApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/transactions`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "transactionType must be one of credit or debit"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/transactions parses filters, caps limit, and returns the paginated transactions payload", async () => {
  const application = express();

  application.use(
    "/admin/transactions",
    createAdminTransactionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminTransactionsHandler: async (
        filters
      ): Promise<AdminTransactionsListResponse> => {
        expect(filters).toEqual({
          userId: 25,
          transactionType: "credit",
          from: new Date("2026-03-01T00:00:00.000Z"),
          to: new Date("2026-03-31T23:59:59.000Z"),
          page: 2,
          limit: 100
        });

        return {
          transactions: [
            {
              id: 168,
              userId: 1,
              amount: 608.64,
              currency: "NGN",
              transactionId: "HOLD_RELEASE:101:delivery:PLATFORM",
              transactionType: "credit",
              description: "Holding release platform commission credit",
              status: 1,
              createdAt: "2026-03-11T14:17:58.000Z"
            }
          ],
          total: 32
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/transactions?userId=25&transactionType=credit&from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.000Z&page=2&limit=250`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      transactions: [
        {
          id: 168,
          userId: 1,
          amount: 608.64,
          currency: "NGN",
          transactionId: "HOLD_RELEASE:101:delivery:PLATFORM",
          transactionType: "credit",
          description: "Holding release platform commission credit",
          status: 1,
          createdAt: "2026-03-11T14:17:58.000Z"
        }
      ],
      total: 32
    });
  } finally {
    await server.close();
  }
});
