import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminOrdersRouter } from "../../src/modules/admin-orders/routes";
import { AdminOrdersValidationError, listOrders } from "../../src/modules/admin-orders/service";
import { AdminOrdersListResponse } from "../../src/modules/admin-orders/types";

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

test("listOrders maps order rows into the admin response payload and total count", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listOrders(
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
              total: 3
            }
          ]) as unknown as QueryResult<T>;
        }

        return createQueryResult([
          {
            id: 233,
            orderNumber: "X0i2sZMEkPwkh45t",
            status: 2,
            buyerUsername: "buyer-one",
            sellerUsername: "hinocag",
            logisticUsername: "rider",
            vehicleType: "bike",
            deliveryDate: null,
            createdAt: new Date("2026-03-24T20:47:54.000Z"),
            updatedAt: new Date("2026-03-24T20:47:55.000Z")
          },
          {
            id: 205,
            orderNumber: "tdnsjLnrsfdz2EO8",
            status: 8,
            buyerUsername: "buyer-two",
            sellerUsername: "hinocag",
            logisticUsername: "robakah",
            vehicleType: "bike",
            deliveryDate: null,
            createdAt: new Date("2026-03-11T12:05:46.000Z"),
            updatedAt: new Date("2026-03-11T12:12:57.000Z")
          },
          {
            id: 204,
            orderNumber: "rTDP60bhlU4qGE9B",
            status: 7,
            buyerUsername: "buyer-three",
            sellerUsername: "hinocag",
            logisticUsername: "foyayog",
            vehicleType: "bike",
            deliveryDate: null,
            createdAt: new Date("2026-03-10T13:23:08.000Z"),
            updatedAt: new Date("2026-03-10T13:25:23.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain('LEFT JOIN public."user" buyer ON buyer.id::bigint = o."userId"');
  expect(executedQueries[0]?.text).toContain('ORDER BY o."createdAt" DESC, o.id DESC');
  expect(executedQueries[0]?.params).toEqual([20, 0]);
  expect(executedQueries[1]?.text).toContain("COUNT(*)::int AS total");
  expect(response).toEqual({
    orderDetails: [
      {
        id: 233,
        orderNumber: "X0i2sZMEkPwkh45t",
        status: "picked_up",
        buyerUsername: "buyer-one",
        sellerUsername: "hinocag",
        logisticUsername: "rider",
        vehicleType: "bike",
        deliveryDate: null,
        createdAt: "2026-03-24T20:47:54.000Z",
        updatedAt: "2026-03-24T20:47:55.000Z"
      },
      {
        id: 205,
        orderNumber: "tdnsjLnrsfdz2EO8",
        status: "delivered",
        buyerUsername: "buyer-two",
        sellerUsername: "hinocag",
        logisticUsername: "robakah",
        vehicleType: "bike",
        deliveryDate: null,
        createdAt: "2026-03-11T12:05:46.000Z",
        updatedAt: "2026-03-11T12:12:57.000Z"
      },
      {
        id: 204,
        orderNumber: "rTDP60bhlU4qGE9B",
        status: "cancelled",
        buyerUsername: "buyer-three",
        sellerUsername: "hinocag",
        logisticUsername: "foyayog",
        vehicleType: "bike",
        deliveryDate: null,
        createdAt: "2026-03-10T13:23:08.000Z",
        updatedAt: "2026-03-10T13:25:23.000Z"
      }
    ],
    total: 3
  });
});

test("listOrders maps delivery dates and unknown numeric statuses safely", async () => {
  const response = await listOrders(
    {
      page: 1,
      limit: 20
    },
    {
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> => {
        if (text.includes("COUNT(*)::int AS total")) {
          return createQueryResult([
            {
              total: 1
            }
          ]) as unknown as QueryResult<T>;
        }

        return createQueryResult([
          {
            id: 999,
            orderNumber: "mystery-order",
            status: 99,
            buyerUsername: null,
            sellerUsername: "seller-one",
            logisticUsername: null,
            vehicleType: "van",
            deliveryDate: new Date("2026-04-02T10:00:00.000Z"),
            createdAt: new Date("2026-04-01T10:00:00.000Z"),
            updatedAt: new Date("2026-04-01T11:00:00.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(response).toEqual({
    orderDetails: [
      {
        id: 999,
        orderNumber: "mystery-order",
        status: "unknown",
        buyerUsername: null,
        sellerUsername: "seller-one",
        logisticUsername: null,
        vehicleType: "van",
        deliveryDate: "2026-04-02T10:00:00.000Z",
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T11:00:00.000Z"
      }
    ],
    total: 1
  });
});

test("listOrders applies filters and rejects invalid filter values", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  await listOrders(
    {
      status: "cancelled",
      sellerUsername: "  seller-one  ",
      buyerUsername: "  buyer-one  ",
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.000Z"),
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

  expect(executedQueries[0]?.text).toContain("o.status = ANY($1::int[])");
  expect(executedQueries[0]?.text).toContain('LOWER(BTRIM(o."sellerUsername")) = LOWER(BTRIM($2))');
  expect(executedQueries[0]?.text).toContain("LOWER(BTRIM(buyer.username)) = LOWER(BTRIM($3))");
  expect(executedQueries[0]?.text).toContain('o."createdAt" >= $4');
  expect(executedQueries[0]?.text).toContain('o."createdAt" <= $5');
  expect(executedQueries[0]?.params).toEqual([
    [6, 7],
    "seller-one",
    "buyer-one",
    new Date("2026-03-01T00:00:00.000Z"),
    new Date("2026-03-31T23:59:59.000Z"),
    50,
    50
  ]);

  await expect(
    listOrders({
      page: 0,
      limit: 20
    })
  ).rejects.toThrow(AdminOrdersValidationError);

  await expect(
    listOrders({
      page: 1,
      limit: 0
    })
  ).rejects.toThrow(AdminOrdersValidationError);

  await expect(
    listOrders({
      sellerUsername: "   ",
      page: 1,
      limit: 20
    })
  ).rejects.toThrow("sellerUsername must be a non-empty string when provided");

  await expect(
    listOrders({
      buyerUsername: "buyer-one",
      page: 1,
      limit: 20,
      from: new Date("2026-04-01T00:00:00.000Z"),
      to: new Date("2026-03-01T00:00:00.000Z")
    })
  ).rejects.toThrow("from must be less than or equal to to");

  await expect(
    listOrders({
      status: "archived" as "pending",
      page: 1,
      limit: 20
    })
  ).rejects.toThrow(
    "status must be one of pending, picked_up, in_transit, delivered, cancelled"
  );
});

test("GET /admin/orders returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/orders returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listOrdersHandler: async () => ({
        orderDetails: [],
        total: 0
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/orders validates query parameters", async () => {
  const application = express();

  application.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listOrdersHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/orders?status=archived`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "status must be one of pending, picked_up, in_transit, delivered, cancelled"
    );

    response = await fetch(`${server.baseUrl}/admin/orders?sellerUsername=`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "sellerUsername must be a non-empty string when provided"
    );

    response = await fetch(`${server.baseUrl}/admin/orders?buyerUsername=`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "buyerUsername must be a non-empty string when provided"
    );

    response = await fetch(`${server.baseUrl}/admin/orders?from=bad-date`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "from must be a valid ISO 8601 datetime"
    );

    response = await fetch(
      `${server.baseUrl}/admin/orders?from=2026-04-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "from must be less than or equal to to"
    );

    response = await fetch(`${server.baseUrl}/admin/orders?page=0`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "page must be a positive integer"
    );

    response = await fetch(`${server.baseUrl}/admin/orders?limit=nope`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "limit must be a positive integer"
    );
  } finally {
    await server.close();
  }
});

test("GET /admin/orders maps service validation errors to 400", async () => {
  const application = express();

  application.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listOrdersHandler: async () => {
        throw new AdminOrdersValidationError("from must be less than or equal to to");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "from must be less than or equal to to"
    );
  } finally {
    await server.close();
  }
});

test("GET /admin/orders returns the filtered orders payload", async () => {
  const application = express();

  application.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listOrdersHandler: async (filters): Promise<AdminOrdersListResponse> => {
        expect(filters).toEqual({
          status: "delivered",
          sellerUsername: "hinocag",
          buyerUsername: "buyer-one",
          from: new Date("2026-03-01T00:00:00.000Z"),
          to: new Date("2026-03-31T23:59:59.000Z"),
          page: 2,
          limit: 100
        });

        return {
          orderDetails: [
            {
              id: 205,
              orderNumber: "tdnsjLnrsfdz2EO8",
              status: "delivered",
              buyerUsername: "buyer-one",
              sellerUsername: "hinocag",
              logisticUsername: "robakah",
              vehicleType: "bike",
              deliveryDate: null,
              createdAt: "2026-03-11T12:05:46.000Z",
              updatedAt: "2026-03-11T12:12:57.000Z"
            }
          ],
          total: 1
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/orders?status=delivered&sellerUsername=hinocag&buyerUsername=buyer-one&from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.000Z&page=2&limit=250`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      orderDetails: [
        {
          id: 205,
          orderNumber: "tdnsjLnrsfdz2EO8",
          status: "delivered",
          buyerUsername: "buyer-one",
          sellerUsername: "hinocag",
          logisticUsername: "robakah",
          vehicleType: "bike",
          deliveryDate: null,
          createdAt: "2026-03-11T12:05:46.000Z",
          updatedAt: "2026-03-11T12:12:57.000Z"
        }
      ],
      total: 1
    });
  } finally {
    await server.close();
  }
});
