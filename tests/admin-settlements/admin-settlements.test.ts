import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminSettlementsRouter } from "../../src/modules/admin-settlements/routes";
import {
  approveAdminSettlement,
  AdminSettlementApprovalConflictError,
  AdminSettlementApprovalNotFoundError,
  AdminSettlementsValidationError,
  listAdminSettlements
} from "../../src/modules/admin-settlements/service";
import {
  AdminApproveSettlementResponse,
  AdminSettlementsListResponse
} from "../../src/modules/admin-settlements/types";

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

test("approveAdminSettlement approves a pending payout, debits the wallet, and writes audit records", async () => {
  const fixedNow = new Date("2026-04-09T10:30:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await approveAdminSettlement(
    1,
    {
      username: " seller-one ",
      amount: 100.5,
      description: " payment description ",
      settlementAccountId: 2,
      actedByAdminUserId: "admin-user-id"
    },
    {
      nowFactory: () => fixedNow,
      uuidFactory: () => "803aa6e8-4a7e-4c62-82f1-4b02fcb7ddab",
      runInTransaction: async (operation) =>
        operation({
          query: async <T extends QueryResultRow = QueryResultRow>(
            text: string,
            params?: unknown[]
          ): Promise<QueryResult<T>> => {
            executedQueries.push({ text, params });

            if (executedQueries.length === 1) {
              return createQueryResult([
                {
                  id: 1,
                  userId: 97,
                  username: " seller-one ",
                  status: 1
                }
              ]) as unknown as QueryResult<T>;
            }

            if (executedQueries.length === 2) {
              return createQueryResult([
                {
                  id: 2,
                  userId: 97,
                  status: 1
                }
              ]) as unknown as QueryResult<T>;
            }

            if (executedQueries.length === 3) {
              return createQueryResult([
                {
                  id: 11,
                  currency: null,
                  availableBalance: "500.5",
                  ledgerBalance: "700.25"
                }
              ]) as unknown as QueryResult<T>;
            }

            if (executedQueries.length === 4) {
              return createQueryResult([]) as unknown as QueryResult<T>;
            }

            if (executedQueries.length === 5) {
              return createQueryResult([]) as unknown as QueryResult<T>;
            }

            if (executedQueries.length === 6) {
              return createQueryResult([
                {
                  id: 1001
                }
              ]) as unknown as QueryResult<T>;
            }

            if (executedQueries.length === 7) {
              return createQueryResult([]) as unknown as QueryResult<T>;
            }

            throw new Error(`Unexpected query: ${text}`);
          }
        })
    }
  );

  expect(response).toEqual({
    message: "Settlement successfully saved"
  });
  expect(executedQueries).toHaveLength(7);
  expect(executedQueries[0]?.text).toContain("FROM public.settlement s");
  expect(executedQueries[0]?.text).toContain("FOR UPDATE");
  expect(executedQueries[0]?.params).toEqual([1]);
  expect(executedQueries[1]?.text).toContain("FROM public.settlement_account sa");
  expect(executedQueries[1]?.params).toEqual([2]);
  expect(executedQueries[2]?.text).toContain("FROM public.wallet w");
  expect(executedQueries[2]?.params).toEqual([97]);
  expect(executedQueries[3]?.text).toContain("UPDATE public.settlement");
  expect(executedQueries[3]?.params).toEqual([100.5, "payment description", 2, 2, fixedNow, 1]);
  expect(executedQueries[4]?.text).toContain("UPDATE public.wallet");
  expect(executedQueries[4]?.params).toEqual([400, 599.75, fixedNow, 11]);
  expect(executedQueries[5]?.text).toContain("INSERT INTO public.wallet_transaction");
  expect(executedQueries[5]?.params).toEqual([
    97,
    100.5,
    "NGN",
    `SETTLEMENT:1:APPROVED:${fixedNow.getTime()}:admin-user-id`,
    1,
    null,
    2,
    599.75,
    400,
    "payment description",
    1,
    fixedNow,
    fixedNow
  ]);
  expect(executedQueries[6]?.text).toContain("INSERT INTO public.admin_settlement_action_audit_logs");
  expect(executedQueries[6]?.params).toEqual([
    "803aa6e8-4a7e-4c62-82f1-4b02fcb7ddab",
    1,
    97,
    11,
    2,
    1001,
    "admin-user-id",
    "approve_settlement",
    100.5,
    "payment description",
    1,
    2,
    500.5,
    400,
    700.25,
    599.75,
    fixedNow
  ]);
});

test("approveAdminSettlement validates payloads and rejects invalid settlement state", async () => {
  await expect(
    approveAdminSettlement(0, {
      username: "seller-one",
      amount: 100,
      description: "payment description",
      settlementAccountId: 1,
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow(AdminSettlementsValidationError);

  await expect(
    approveAdminSettlement(1, {
      username: "   ",
      amount: 100,
      description: "payment description",
      settlementAccountId: 1,
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow(AdminSettlementsValidationError);

  await expect(
    approveAdminSettlement(1, {
      username: "seller-one",
      amount: 10.001,
      description: "payment description",
      settlementAccountId: 1,
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow(AdminSettlementsValidationError);

  await expect(
    approveAdminSettlement(1, {
      username: "seller-one",
      amount: 100,
      description: "   ",
      settlementAccountId: 1,
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow(AdminSettlementsValidationError);

  await expect(
    approveAdminSettlement(
      1,
      {
        username: "seller-one",
        amount: 100,
        description: "payment description",
        settlementAccountId: 1,
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation({
            query: async <T extends QueryResultRow = QueryResultRow>() =>
              createQueryResult([]) as unknown as QueryResult<T>
          })
      }
    )
  ).rejects.toThrow(AdminSettlementApprovalNotFoundError);

  await expect(
    approveAdminSettlement(
      1,
      {
        username: "other-user",
        amount: 100,
        description: "payment description",
        settlementAccountId: 1,
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation({
            query: async <T extends QueryResultRow = QueryResultRow>(
              text: string
            ): Promise<QueryResult<T>> => {
              if (text.includes("FROM public.settlement s")) {
                return createQueryResult([
                  {
                    id: 1,
                    userId: 97,
                    username: "seller-one",
                    status: 1
                  }
                ]) as unknown as QueryResult<T>;
              }

              throw new Error(`Unexpected query: ${text}`);
            }
          })
      }
    )
  ).rejects.toThrow(AdminSettlementApprovalConflictError);

  await expect(
    approveAdminSettlement(
      1,
      {
        username: "seller-one",
        amount: 100,
        description: "payment description",
        settlementAccountId: 1,
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation({
            query: async <T extends QueryResultRow = QueryResultRow>(
              text: string
            ): Promise<QueryResult<T>> => {
              if (text.includes("FROM public.settlement s")) {
                return createQueryResult([
                  {
                    id: 1,
                    userId: 97,
                    username: "seller-one",
                    status: 2
                  }
                ]) as unknown as QueryResult<T>;
              }

              throw new Error(`Unexpected query: ${text}`);
            }
          })
      }
    )
  ).rejects.toThrow("Settlement request is not pending");

  await expect(
    approveAdminSettlement(
      1,
      {
        username: "seller-one",
        amount: 100,
        description: "payment description",
        settlementAccountId: 1,
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation({
            query: async <T extends QueryResultRow = QueryResultRow>(
              text: string
            ): Promise<QueryResult<T>> => {
              if (text.includes("FROM public.settlement s")) {
                return createQueryResult([
                  {
                    id: 1,
                    userId: 97,
                    username: "seller-one",
                    status: 1
                  }
                ]) as unknown as QueryResult<T>;
              }

              if (text.includes("FROM public.settlement_account sa")) {
                return createQueryResult([
                  {
                    id: 1,
                    userId: 8,
                    status: 1
                  }
                ]) as unknown as QueryResult<T>;
              }

              throw new Error(`Unexpected query: ${text}`);
            }
          })
      }
    )
  ).rejects.toThrow("Settlement account does not belong to the beneficiary user");

  await expect(
    approveAdminSettlement(
      1,
      {
        username: "seller-one",
        amount: 100,
        description: "payment description",
        settlementAccountId: 1,
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation({
            query: async <T extends QueryResultRow = QueryResultRow>(
              text: string
            ): Promise<QueryResult<T>> => {
              if (text.includes("FROM public.settlement s")) {
                return createQueryResult([
                  {
                    id: 1,
                    userId: 97,
                    username: "seller-one",
                    status: 1
                  }
                ]) as unknown as QueryResult<T>;
              }

              if (text.includes("FROM public.settlement_account sa")) {
                return createQueryResult([
                  {
                    id: 1,
                    userId: 97,
                    status: 1
                  }
                ]) as unknown as QueryResult<T>;
              }

              if (text.includes("FROM public.wallet w")) {
                return createQueryResult([]) as unknown as QueryResult<T>;
              }

              throw new Error(`Unexpected query: ${text}`);
            }
          })
      }
    )
  ).rejects.toThrow("Beneficiary wallet not found for settlement payout");

  await expect(
    approveAdminSettlement(
      1,
      {
        username: "seller-one",
        amount: 100,
        description: "payment description",
        settlementAccountId: 1,
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation({
            query: async <T extends QueryResultRow = QueryResultRow>(
              text: string
            ): Promise<QueryResult<T>> => {
              if (text.includes("FROM public.settlement s")) {
                return createQueryResult([
                  {
                    id: 1,
                    userId: 97,
                    username: "seller-one",
                    status: 1
                  }
                ]) as unknown as QueryResult<T>;
              }

              if (text.includes("FROM public.settlement_account sa")) {
                return createQueryResult([
                  {
                    id: 1,
                    userId: 97,
                    status: 1
                  }
                ]) as unknown as QueryResult<T>;
              }

              if (text.includes("FROM public.wallet w")) {
                return createQueryResult([
                  {
                    id: 11,
                    currency: "NGN",
                    availableBalance: 50,
                    ledgerBalance: 80
                  }
                ]) as unknown as QueryResult<T>;
              }

              throw new Error(`Unexpected query: ${text}`);
            }
          })
      }
    )
  ).rejects.toThrow("Insufficient available balance for settlement payout");
});

test("PUT /admin/settlements/:id/approve returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());

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
    const response = await fetch(`${server.baseUrl}/admin/settlements/1/approve`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "seller-one",
        amount: 100.5,
        description: "payment description",
        settlementAccountId: 1
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/settlements/:id/approve returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/settlements",
    createAdminSettlementsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      approveAdminSettlementHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/settlements/1/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "seller-one",
        amount: 100.5,
        description: "payment description",
        settlementAccountId: 1
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/settlements/:id/approve validates the path and body", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/settlements",
    createAdminSettlementsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveAdminSettlementHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/settlements/abc/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "seller-one",
        amount: 100.5,
        description: "payment description",
        settlementAccountId: 1
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "id must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/settlements/1/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: 100.5,
        description: "payment description",
        settlementAccountId: 1
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "username must be a non-empty string"
    });

    response = await fetch(`${server.baseUrl}/admin/settlements/1/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "seller-one",
        amount: 10.001,
        description: "payment description",
        settlementAccountId: 1
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "amount must be a positive finite number with at most 2 decimal places"
    });

    response = await fetch(`${server.baseUrl}/admin/settlements/1/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "seller-one",
        amount: 100.5,
        description: "   ",
        settlementAccountId: 1
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "description must be a non-empty string"
    });

    response = await fetch(`${server.baseUrl}/admin/settlements/1/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "seller-one",
        amount: 100.5,
        description: "payment description",
        settlementAccountId: 0
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "settlementAccountId must be a positive integer"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/settlements/:id/approve maps 404 and 409 errors", async () => {
  let server;
  const notFoundApplication = express();
  notFoundApplication.use(express.json());

  notFoundApplication.use(
    "/admin/settlements",
    createAdminSettlementsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveAdminSettlementHandler: async () => {
        throw new AdminSettlementApprovalNotFoundError("Settlement request not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/settlements/1/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "seller-one",
        amount: 100.5,
        description: "payment description",
        settlementAccountId: 1
      })
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Settlement request not found"
    });
  } finally {
    await server.close();
  }

  const conflictApplication = express();
  conflictApplication.use(express.json());

  conflictApplication.use(
    "/admin/settlements",
    createAdminSettlementsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveAdminSettlementHandler: async () => {
        throw new AdminSettlementApprovalConflictError(
          "Insufficient available balance for settlement payout"
        );
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/settlements/1/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "seller-one",
        amount: 100.5,
        description: "payment description",
        settlementAccountId: 1
      })
    });

    expect(response.status).toBe(409);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Insufficient available balance for settlement payout"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/settlements/:id/approve returns the success payload and passes trimmed values", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/settlements",
    createAdminSettlementsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveAdminSettlementHandler: async (
        settlementId,
        payload
      ): Promise<AdminApproveSettlementResponse> => {
        expect(settlementId).toBe(1);
        expect(payload).toEqual({
          username: "seller-one",
          amount: 100.5,
          description: "payment description",
          settlementAccountId: 1,
          actedByAdminUserId: "admin-user-id"
        });

        return {
          message: "Settlement successfully saved"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/settlements/1/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: " seller-one ",
        amount: 100.5,
        description: " payment description ",
        settlementAccountId: 1
      })
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Settlement successfully saved"
    });
  } finally {
    await server.close();
  }
});
