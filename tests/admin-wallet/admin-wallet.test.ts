import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminWalletRouter } from "../../src/modules/admin-wallet/routes";
import {
  getUserWallet,
  getPlatformWalletOverview,
  PlatformWalletNotFoundError
} from "../../src/modules/admin-wallet/service";
import {
  PlatformWalletOverviewResponse,
  UserWalletResponse
} from "../../src/modules/admin-wallet/types";
import {
  UserWalletConflictError,
  UserWalletNotFoundError,
  UserWalletValidationError
} from "../../src/modules/admin-wallet/service";

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

test("getPlatformWalletOverview returns the platform user, balances, commission totals, and recent transactions", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getPlatformWalletOverview({
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      executedQueries.push({ text, params });

      if (text.includes('FROM public."user" u')) {
        return createQueryResult([
          {
            id: "1",
            username: " brickpine "
          }
        ]) as unknown as QueryResult<T>;
      }

      if (text.includes("FROM public.wallet w")) {
        return createQueryResult([
          {
            availableBalance: "20279.58",
            ledgerBalance: "4257.072"
          }
        ]) as unknown as QueryResult<T>;
      }

      if (text.includes("FROM public.earnings e")) {
        return createQueryResult([
          {
            sellerCommissionTotal: "362987.50",
            logisticsCommissionTotal: "14158.38"
          }
        ]) as unknown as QueryResult<T>;
      }

      if (text.includes("FROM public.wallet_transaction wt")) {
        return createQueryResult([
          {
            id: 91,
            amount: "2500",
            currency: null,
            transactionId: "HOLD_RELEASE:100:product:PLATFORM",
            transactionType: "2",
            description: "Holding release platform commission credit",
            createdAt: new Date("2026-04-08T09:15:00.000Z")
          },
          {
            id: 90,
            amount: 1200.75,
            currency: "NGN",
            transactionId: null,
            transactionType: null,
            description: "Checkout hold for product funds",
            createdAt: new Date("2026-04-07T09:15:00.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }

      throw new Error(`Unexpected query: ${text}`);
    }
  });

  expect(executedQueries).toHaveLength(4);
  expect(executedQueries[0]?.text).toContain('LOWER(BTRIM(u.username)) = LOWER(BTRIM($1))');
  expect(executedQueries[0]?.params).toEqual(["brickpine"]);
  expect(executedQueries[1]?.text).toContain('ORDER BY w."createdAt" DESC NULLS LAST, w.id DESC');
  expect(executedQueries[1]?.params).toEqual([1]);
  expect(executedQueries[2]?.text).toContain('SUM(e."commissionAmount") FILTER (WHERE e.type = \'seller\')');
  expect(executedQueries[3]?.text).toContain('ORDER BY wt."createdAt" DESC, wt.id DESC');
  expect(executedQueries[3]?.params).toEqual([1, 20]);
  expect(response).toEqual({
    platformUser: {
      id: 1,
      username: "brickpine"
    },
    wallet: {
      availableBalance: 20279.58,
      ledgerBalance: 4257.072
    },
    commissionSummary: {
      sellerCommissionTotal: 362987.5,
      logisticsCommissionTotal: 14158.38,
      totalCommission: 377145.88
    },
    transactions: [
      {
        id: 91,
        amount: 2500,
        currency: "NGN",
        transactionId: "HOLD_RELEASE:100:product:PLATFORM",
        transactionType: 2,
        description: "Holding release platform commission credit",
        createdAt: "2026-04-08T09:15:00.000Z"
      },
      {
        id: 90,
        amount: 1200.75,
        currency: "NGN",
        transactionId: null,
        transactionType: null,
        description: "Checkout hold for product funds",
        createdAt: "2026-04-07T09:15:00.000Z"
      }
    ]
  });
});

test("getPlatformWalletOverview returns zero balances, zero commission totals, and no transactions when optional data is missing", async () => {
  const response = await getPlatformWalletOverview({
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string
    ): Promise<QueryResult<T>> => {
      if (text.includes('FROM public."user" u')) {
        return createQueryResult([
          {
            id: 1,
            username: "brickpine"
          }
        ]) as unknown as QueryResult<T>;
      }

      if (text.includes("FROM public.wallet w")) {
        return createQueryResult([]) as unknown as QueryResult<T>;
      }

      if (text.includes("FROM public.earnings e")) {
        return createQueryResult([
          {
            sellerCommissionTotal: null,
            logisticsCommissionTotal: null
          }
        ]) as unknown as QueryResult<T>;
      }

      if (text.includes("FROM public.wallet_transaction wt")) {
        return createQueryResult([]) as unknown as QueryResult<T>;
      }

      throw new Error(`Unexpected query: ${text}`);
    }
  });

  expect(response).toEqual({
    platformUser: {
      id: 1,
      username: "brickpine"
    },
    wallet: {
      availableBalance: 0,
      ledgerBalance: 0
    },
    commissionSummary: {
      sellerCommissionTotal: 0,
      logisticsCommissionTotal: 0,
      totalCommission: 0
    },
    transactions: []
  });
});

test("getPlatformWalletOverview throws not found when the platform wallet user cannot be resolved", async () => {
  await expect(
    getPlatformWalletOverview({
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(PlatformWalletNotFoundError);
});

test("GET /admin/wallet/platform returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/wallet",
    createAdminWalletRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/wallet/platform`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/wallet/platform returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/wallet",
    createAdminWalletRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "finance"
        })
      ),
      getPlatformWalletOverviewHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/wallet/platform`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/wallet/platform maps not-found errors to 404", async () => {
  const application = express();

  application.use(
    "/admin/wallet",
    createAdminWalletRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getPlatformWalletOverviewHandler: async () => {
        throw new PlatformWalletNotFoundError("Platform wallet user not found");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/wallet/platform`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Platform wallet user not found"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/wallet/platform returns the platform wallet overview payload", async () => {
  const application = express();

  application.use(
    "/admin/wallet",
    createAdminWalletRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getPlatformWalletOverviewHandler: async (): Promise<PlatformWalletOverviewResponse> => ({
        platformUser: {
          id: 1,
          username: "brickpine"
        },
        wallet: {
          availableBalance: 20279.58,
          ledgerBalance: 4257.072
        },
        commissionSummary: {
          sellerCommissionTotal: 362987.5,
          logisticsCommissionTotal: 14158.38,
          totalCommission: 377145.88
        },
        transactions: [
          {
            id: 91,
            amount: 2500,
            currency: "NGN",
            transactionId: "HOLD_RELEASE:100:product:PLATFORM",
            transactionType: 2,
            description: "Holding release platform commission credit",
            createdAt: "2026-04-08T09:15:00.000Z"
          }
        ]
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/wallet/platform`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      platformUser: {
        id: 1,
        username: "brickpine"
      },
      wallet: {
        availableBalance: 20279.58,
        ledgerBalance: 4257.072
      },
      commissionSummary: {
        sellerCommissionTotal: 362987.5,
        logisticsCommissionTotal: 14158.38,
        totalCommission: 377145.88
      },
      transactions: [
        {
          id: 91,
          amount: 2500,
          currency: "NGN",
          transactionId: "HOLD_RELEASE:100:product:PLATFORM",
          transactionType: 2,
          description: "Holding release platform commission credit",
          createdAt: "2026-04-08T09:15:00.000Z"
        }
      ]
    });
  } finally {
    await server.close();
  }
});

test("getUserWallet returns the requested user's wallet payload", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getUserWallet(" Buyer-One ", {
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      executedQueries.push({ text, params });

      if (text.includes('FROM public."user" u')) {
        return createQueryResult([
          {
            id: "42",
            username: " Buyer-One "
          }
        ]) as unknown as QueryResult<T>;
      }

      if (text.includes("FROM public.wallet w")) {
        return createQueryResult([
          {
            currency: null,
            availableBalance: "200.5",
            ledgerBalance: "350.75"
          }
        ]) as unknown as QueryResult<T>;
      }

      throw new Error(`Unexpected query: ${text}`);
    }
  });

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain('WHERE u."userTypeId" IN (1, 2, 3)');
  expect(executedQueries[0]?.text).toContain("AND LOWER(u.username) = LOWER($1)");
  expect(executedQueries[0]?.params).toEqual(["Buyer-One"]);
  expect(executedQueries[1]?.text).toContain('ORDER BY w."createdAt" DESC NULLS LAST, w.id DESC');
  expect(executedQueries[1]?.params).toEqual([42]);
  expect(response).toEqual({
    username: "Buyer-One",
    availableBalance: 200.5,
    ledgerBalance: 350.75,
    currency: "NGN"
  });
});

test("getUserWallet returns zero balances and NGN currency when the user has no wallet row", async () => {
  const response = await getUserWallet("buyer-two", {
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string
    ): Promise<QueryResult<T>> => {
      if (text.includes('FROM public."user" u')) {
        return createQueryResult([
          {
            id: 50,
            username: "buyer-two"
          }
        ]) as unknown as QueryResult<T>;
      }

      if (text.includes("FROM public.wallet w")) {
        return createQueryResult([]) as unknown as QueryResult<T>;
      }

      throw new Error(`Unexpected query: ${text}`);
    }
  });

  expect(response).toEqual({
    username: "buyer-two",
    availableBalance: 0,
    ledgerBalance: 0,
    currency: "NGN"
  });
});

test("getUserWallet validates username and rejects missing or ambiguous matches", async () => {
  await expect(getUserWallet("   ")).rejects.toThrow(UserWalletValidationError);

  await expect(
    getUserWallet("missing-user", {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(UserWalletNotFoundError);

  await expect(
    getUserWallet("duplicate-user", {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([
          {
            id: 41,
            username: "duplicate-user"
          },
          {
            id: 42,
            username: "Duplicate-User"
          }
        ]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(UserWalletConflictError);
});

test("GET /admin/wallet/:username returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/wallet",
    createAdminWalletRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/wallet/buyer-one`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/wallet/:username returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/wallet",
    createAdminWalletRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      getUserWalletHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/wallet/buyer-one`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/wallet/:username validates the username path param and maps 404 and 409 errors", async () => {
  let server;
  const validationApplication = express();

  validationApplication.use(
    "/admin/wallet",
    createAdminWalletRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getUserWalletHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  server = await startTestServer(validationApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/wallet/%20%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "username must be a non-empty string"
    });
  } finally {
    await server.close();
  }

  const notFoundApplication = express();

  notFoundApplication.use(
    "/admin/wallet",
    createAdminWalletRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getUserWalletHandler: async () => {
        throw new UserWalletNotFoundError("User wallet not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/wallet/missing-user`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "User wallet not found"
    });
  } finally {
    await server.close();
  }

  const conflictApplication = express();

  conflictApplication.use(
    "/admin/wallet",
    createAdminWalletRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getUserWalletHandler: async () => {
        throw new UserWalletConflictError("Multiple users match the provided username");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/wallet/duplicate-user`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(409);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Multiple users match the provided username"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/wallet/:username returns the requested user wallet payload", async () => {
  const application = express();

  application.use(
    "/admin/wallet",
    createAdminWalletRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getUserWalletHandler: async (username): Promise<UserWalletResponse> => {
        expect(username).toBe("buyer-one");

        return {
          username: "buyer-one",
          availableBalance: 250,
          ledgerBalance: 300,
          currency: "NGN"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/wallet/%20buyer-one%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      username: "buyer-one",
      availableBalance: 250,
      ledgerBalance: 300,
      currency: "NGN"
    });
  } finally {
    await server.close();
  }
});
