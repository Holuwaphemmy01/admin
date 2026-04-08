import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminOrdersRouter } from "../../src/modules/admin-orders/routes";
import {
  AdminOrderConflictError,
  AdminOrderNotFoundError,
  AdminOrdersValidationError,
  cancelOrdersByAdmin,
  getOrderDetails,
  listOrders
} from "../../src/modules/admin-orders/service";
import {
  AdminOrderDetailsResponse,
  CancelAdminOrdersResponse,
  AdminOrdersListResponse
} from "../../src/modules/admin-orders/types";

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

function createTransactionClient(
  queryImplementation: (text: string, params?: unknown[]) => Promise<QueryResult<QueryResultRow>>
) {
  return {
    query: async <T extends QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      const result = await queryImplementation(text, params);

      return result as unknown as QueryResult<T>;
    }
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

test("getOrderDetails returns nested party details, line items, and summed totalAmount", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getOrderDetails("  X0i2sZMEkPwkh45t  ", {
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      executedQueries.push({ text, params });

      if (text.includes("FROM public.order_tb o")) {
        return createQueryResult([
          {
            id: 233,
            orderNumber: "X0i2sZMEkPwkh45t",
            status: 2,
            cartId: 317,
            sellerUsernameRaw: "hinocag",
            logisticsUsernameRaw: "rider",
            orderVehicleType: "bike",
            deliveryStatus: "assigned",
            buyerUsername: "CustomerB",
            buyerFirstName: "ohxoux",
            buyerLastName: "kyxyoz",
            buyerEmailAddress: "buyer@example.com",
            buyerPhoneNumber: "0807825986",
            sellerUsernameResolved: "hinocag",
            sellerFirstName: "hinocag",
            sellerLastName: "emaxasp",
            sellerEmailAddress: "seller@example.com",
            sellerPhoneNumber: "08030000000",
            logisticsUsernameResolved: "rider",
            logisticsFirstName: "Ride",
            logisticsLastName: "Rider",
            logisticsEmailAddress: "rider@example.com",
            logisticsPhoneNumber: "08040000000",
            logisticsVehicleType: "bike",
            createdAt: new Date("2026-03-24T20:47:54.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }

      return createQueryResult([
        {
          cartId: 317,
          productId: 59,
          productName: "my product",
          quantity: 1,
          unitPrice: 1000,
          amount: 1000,
          currency: "NGN",
          imageUrl: "https://cdn.example.com/product-59.png",
          sku: "SKU-59"
        },
        {
          cartId: 318,
          productId: 60,
          productName: "second product",
          quantity: 2,
          unitPrice: 1250.25,
          amount: 2500.5,
          currency: "NGN",
          imageUrl: null,
          sku: null
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.params).toEqual(["X0i2sZMEkPwkh45t"]);
  expect(executedQueries[1]?.params).toEqual([317, 233]);
  expect(response).toEqual({
    orderStatus: {
      orderNumber: "X0i2sZMEkPwkh45t",
      status: "picked_up",
      buyer: {
        username: "CustomerB",
        firstName: "ohxoux",
        lastName: "kyxyoz",
        emailAddress: "buyer@example.com",
        phoneNumber: "0807825986"
      },
      seller: {
        username: "hinocag",
        firstName: "hinocag",
        lastName: "emaxasp",
        emailAddress: "seller@example.com",
        phoneNumber: "08030000000"
      },
      logistics: {
        username: "rider",
        firstName: "Ride",
        lastName: "Rider",
        emailAddress: "rider@example.com",
        phoneNumber: "08040000000",
        vehicleType: "bike",
        deliveryStatus: "assigned"
      },
      items: [
        {
          cartId: 317,
          productId: 59,
          productName: "my product",
          quantity: 1,
          unitPrice: 1000,
          amount: 1000,
          currency: "NGN",
          imageUrl: "https://cdn.example.com/product-59.png",
          sku: "SKU-59"
        },
        {
          cartId: 318,
          productId: 60,
          productName: "second product",
          quantity: 2,
          unitPrice: 1250.25,
          amount: 2500.5,
          currency: "NGN",
          imageUrl: null,
          sku: null
        }
      ],
      totalAmount: 3500.5,
      createdAt: "2026-03-24T20:47:54.000Z"
    }
  });
});

test("getOrderDetails falls back safely for unresolved seller and logistics users and derives total from unit price when needed", async () => {
  const response = await getOrderDetails("order-fallback-1", {
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string
    ): Promise<QueryResult<T>> => {
      if (text.includes("FROM public.order_tb o")) {
        return createQueryResult([
          {
            id: 401,
            orderNumber: "order-fallback-1",
            status: 99,
            cartId: 889,
            sellerUsernameRaw: "seller-raw",
            logisticsUsernameRaw: "rider-raw",
            orderVehicleType: "van",
            deliveryStatus: null,
            buyerUsername: null,
            buyerFirstName: null,
            buyerLastName: null,
            buyerEmailAddress: null,
            buyerPhoneNumber: null,
            sellerUsernameResolved: null,
            sellerFirstName: null,
            sellerLastName: null,
            sellerEmailAddress: null,
            sellerPhoneNumber: null,
            logisticsUsernameResolved: null,
            logisticsFirstName: null,
            logisticsLastName: null,
            logisticsEmailAddress: null,
            logisticsPhoneNumber: null,
            logisticsVehicleType: null,
            createdAt: new Date("2026-04-01T09:00:00.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }

      return createQueryResult([
        {
          cartId: 889,
          productId: 66,
          productName: "Fallback Item",
          quantity: 2,
          unitPrice: 25,
          amount: null,
          currency: "NGN",
          imageUrl: null,
          sku: null
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(response).toEqual({
    orderStatus: {
      orderNumber: "order-fallback-1",
      status: "unknown",
      buyer: {
        username: null,
        firstName: null,
        lastName: null,
        emailAddress: null,
        phoneNumber: null
      },
      seller: {
        username: "seller-raw",
        firstName: null,
        lastName: null,
        emailAddress: null,
        phoneNumber: null
      },
      logistics: {
        username: "rider-raw",
        firstName: null,
        lastName: null,
        emailAddress: null,
        phoneNumber: null,
        vehicleType: "van",
        deliveryStatus: null
      },
      items: [
        {
          cartId: 889,
          productId: 66,
          productName: "Fallback Item",
          quantity: 2,
          unitPrice: 25,
          amount: null,
          currency: "NGN",
          imageUrl: null,
          sku: null
        }
      ],
      totalAmount: 50,
      createdAt: "2026-04-01T09:00:00.000Z"
    }
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

test("getOrderDetails rejects blank order numbers and returns not found when no matching order exists", async () => {
  await expect(getOrderDetails("   ")).rejects.toThrow(AdminOrdersValidationError);

  await expect(
    getOrderDetails("missing-order", {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(AdminOrderNotFoundError);
});

test("cancelOrdersByAdmin updates selected orders, cancels linked deliveries, and writes audit logs", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  const timestamp = new Date("2026-04-08T12:00:00.000Z");

  const response = await cancelOrdersByAdmin(
    {
      orderNumber: "QfRkbH41t27wDHVj",
      orderIds: [1, 6],
      reason: "  Fraud review  ",
      actedByAdminUserId: "admin-user-id"
    },
    {
      nowFactory: () => timestamp,
      uuidFactory: (() => {
        const values = ["audit-1", "audit-2"];
        let index = 0;
        return () => values[index++] ?? `audit-${index}`;
      })(),
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            executedQueries.push({ text, params });

            if (text.includes('WHERE BTRIM(o."orderNumber") = BTRIM($1)')) {
              return createQueryResult([
                {
                  id: 1,
                  orderNumber: "QfRkbH41t27wDHVj",
                  status: 1,
                  deliveryId: null,
                  deliveryStatus: null
                },
                {
                  id: 2,
                  orderNumber: "QfRkbH41t27wDHVj",
                  status: 1,
                  deliveryId: 55,
                  deliveryStatus: "assigned"
                },
                {
                  id: 6,
                  orderNumber: "QfRkbH41t27wDHVj",
                  status: 3,
                  deliveryId: 2,
                  deliveryStatus: "assigned"
                }
              ]);
            }

            return createQueryResult([]);
          })
        )
    }
  );

  expect(response).toEqual({
    message: "Order cancelled"
  });
  expect(executedQueries[0]?.text).toContain("FOR UPDATE");
  expect(executedQueries[0]?.params).toEqual(["QfRkbH41t27wDHVj"]);
  expect(executedQueries[1]?.text).toContain("UPDATE public.order_tb");
  expect(executedQueries[1]?.params).toEqual([6, timestamp, [1, 6]]);
  expect(executedQueries[2]?.text).toContain("UPDATE public.delivery");
  expect(executedQueries[2]?.params).toEqual(["Fraud review", timestamp, [2]]);
  expect(executedQueries[3]?.text).toContain("INSERT INTO public.admin_order_action_audit_logs");
  expect(executedQueries[3]?.params).toEqual([
    "audit-1",
    1,
    "admin-user-id",
    "force_cancel",
    1,
    6,
    "QfRkbH41t27wDHVj",
    "Fraud review",
    timestamp
  ]);
  expect(executedQueries[4]?.params).toEqual([
    "audit-2",
    6,
    "admin-user-id",
    "force_cancel",
    3,
    6,
    "QfRkbH41t27wDHVj",
    "Fraud review",
    timestamp
  ]);
});

test("cancelOrdersByAdmin validates required fields and rejects mismatched, delivered, completed, and already-cancelled orders", async () => {
  await expect(
    cancelOrdersByAdmin({
      orderNumber: "   ",
      orderIds: [1],
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow(AdminOrdersValidationError);

  await expect(
    cancelOrdersByAdmin({
      orderNumber: "QfRkbH41t27wDHVj",
      orderIds: [],
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow("orderIds must be a non-empty array of positive integers");

  await expect(
    cancelOrdersByAdmin({
      orderNumber: "QfRkbH41t27wDHVj",
      orderIds: [1, 1],
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow("orderIds must not contain duplicate values");

  await expect(
    cancelOrdersByAdmin({
      orderNumber: "QfRkbH41t27wDHVj",
      orderIds: [1],
      reason: "   ",
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow("reason must be a non-empty string when provided");

  await expect(
    cancelOrdersByAdmin(
      {
        orderNumber: "missing-order",
        orderIds: [1],
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(createTransactionClient(async () => createQueryResult([])))
      }
    )
  ).rejects.toThrow(AdminOrderNotFoundError);

  await expect(
    cancelOrdersByAdmin(
      {
        orderNumber: "QfRkbH41t27wDHVj",
        orderIds: [1, 999],
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async () =>
              createQueryResult([
                {
                  id: 1,
                  orderNumber: "QfRkbH41t27wDHVj",
                  status: 1,
                  deliveryId: null,
                  deliveryStatus: null
                }
              ])
            )
          )
      }
    )
  ).rejects.toThrow("orderIds must reference existing orders for this orderNumber");

  await expect(
    cancelOrdersByAdmin(
      {
        orderNumber: "delivered-order",
        orderIds: [8],
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async () =>
              createQueryResult([
                {
                  id: 8,
                  orderNumber: "delivered-order",
                  status: 8,
                  deliveryId: 11,
                  deliveryStatus: "completed"
                }
              ])
            )
          )
      }
    )
  ).rejects.toThrow(AdminOrderConflictError);

  await expect(
    cancelOrdersByAdmin(
      {
        orderNumber: "cancelled-order",
        orderIds: [6],
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async () =>
              createQueryResult([
                {
                  id: 6,
                  orderNumber: "cancelled-order",
                  status: 6,
                  deliveryId: null,
                  deliveryStatus: null
                }
              ])
            )
          )
      }
    )
  ).rejects.toThrow("One or more selected orders are already cancelled");

  await expect(
    cancelOrdersByAdmin(
      {
        orderNumber: "completed-delivery-order",
        orderIds: [12],
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async () =>
              createQueryResult([
                {
                  id: 12,
                  orderNumber: "completed-delivery-order",
                  status: 3,
                  deliveryId: 22,
                  deliveryStatus: "completed"
                }
              ])
            )
          )
      }
    )
  ).rejects.toThrow("Orders with completed deliveries cannot be cancelled");
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

test("GET /admin/orders/:orderNumber returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/orders/X0i2sZMEkPwkh45t`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/orders/:orderNumber returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "finance"
        })
      ),
      getOrderDetailsHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders/X0i2sZMEkPwkh45t`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/orders/:orderNumber validates the path param and maps 404 and 400 errors", async () => {
  let server;
  const validationApplication = express();

  validationApplication.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getOrderDetailsHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  server = await startTestServer(validationApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders/%20%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "orderNumber must be a non-empty string"
    );
  } finally {
    await server.close();
  }

  const notFoundApplication = express();

  notFoundApplication.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getOrderDetailsHandler: async () => {
        throw new AdminOrderNotFoundError("Order not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders/missing-order`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);
    expect(((await response.json()) as Record<string, unknown>).message).toBe("Order not found");
  } finally {
    await server.close();
  }

  const badRequestApplication = express();

  badRequestApplication.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getOrderDetailsHandler: async () => {
        throw new AdminOrdersValidationError("orderNumber must be a non-empty string");
      }
    })
  );

  server = await startTestServer(badRequestApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders/X0i2sZMEkPwkh45t`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "orderNumber must be a non-empty string"
    );
  } finally {
    await server.close();
  }
});

test("GET /admin/orders/:orderNumber returns the full order details payload", async () => {
  const application = express();

  application.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getOrderDetailsHandler: async (orderNumber): Promise<AdminOrderDetailsResponse> => {
        expect(orderNumber).toBe("X0i2sZMEkPwkh45t");

        return {
          orderStatus: {
            orderNumber: "X0i2sZMEkPwkh45t",
            status: "picked_up",
            buyer: {
              username: "CustomerB",
              firstName: "ohxoux",
              lastName: "kyxyoz",
              emailAddress: "buyer@example.com",
              phoneNumber: "0807825986"
            },
            seller: {
              username: "hinocag",
              firstName: "hinocag",
              lastName: "emaxasp",
              emailAddress: "seller@example.com",
              phoneNumber: "08030000000"
            },
            logistics: {
              username: "rider",
              firstName: "Ride",
              lastName: "Rider",
              emailAddress: "rider@example.com",
              phoneNumber: "08040000000",
              vehicleType: "bike",
              deliveryStatus: "assigned"
            },
            items: [
              {
                cartId: 317,
                productId: 59,
                productName: "my product",
                quantity: 1,
                unitPrice: 1000,
                amount: 1000,
                currency: "NGN",
                imageUrl: "https://cdn.example.com/product-59.png",
                sku: "SKU-59"
              }
            ],
            totalAmount: 1000,
            createdAt: "2026-03-24T20:47:54.000Z"
          }
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders/%20X0i2sZMEkPwkh45t%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      orderStatus: {
        orderNumber: "X0i2sZMEkPwkh45t",
        status: "picked_up",
        buyer: {
          username: "CustomerB",
          firstName: "ohxoux",
          lastName: "kyxyoz",
          emailAddress: "buyer@example.com",
          phoneNumber: "0807825986"
        },
        seller: {
          username: "hinocag",
          firstName: "hinocag",
          lastName: "emaxasp",
          emailAddress: "seller@example.com",
          phoneNumber: "08030000000"
        },
        logistics: {
          username: "rider",
          firstName: "Ride",
          lastName: "Rider",
          emailAddress: "rider@example.com",
          phoneNumber: "08040000000",
          vehicleType: "bike",
          deliveryStatus: "assigned"
        },
        items: [
          {
            cartId: 317,
            productId: 59,
            productName: "my product",
            quantity: 1,
            unitPrice: 1000,
            amount: 1000,
            currency: "NGN",
            imageUrl: "https://cdn.example.com/product-59.png",
            sku: "SKU-59"
          }
        ],
        totalAmount: 1000,
        createdAt: "2026-03-24T20:47:54.000Z"
      }
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/orders/:orderNumber/cancel returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(express.json());
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
    const response = await fetch(`${server.baseUrl}/admin/orders/QfRkbH41t27wDHVj/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orderIds: [1]
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/orders/:orderNumber/cancel returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      cancelOrdersByAdminHandler: async () => ({
        message: "Order cancelled"
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders/QfRkbH41t27wDHVj/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        orderIds: [1]
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/orders/:orderNumber/cancel validates the path and request body", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      cancelOrdersByAdminHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/orders/%20%20/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        orderIds: [1]
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "orderNumber must be a non-empty string"
    );

    response = await fetch(`${server.baseUrl}/admin/orders/QfRkbH41t27wDHVj/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        orderIds: []
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "orderIds must be a non-empty array of positive integers"
    );

    response = await fetch(`${server.baseUrl}/admin/orders/QfRkbH41t27wDHVj/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        orderIds: [1, 1]
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "orderIds must not contain duplicate values"
    );

    response = await fetch(`${server.baseUrl}/admin/orders/QfRkbH41t27wDHVj/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        orderIds: ["1"]
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "orderIds must be a non-empty array of positive integers"
    );

    response = await fetch(`${server.baseUrl}/admin/orders/QfRkbH41t27wDHVj/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        orderIds: [1],
        reason: "   "
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "reason must be a non-empty string when provided"
    );
  } finally {
    await server.close();
  }
});

test("PUT /admin/orders/:orderNumber/cancel maps not-found and conflict errors", async () => {
  let server;
  const notFoundApplication = express();

  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      cancelOrdersByAdminHandler: async () => {
        throw new AdminOrderNotFoundError("Order not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders/missing/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        orderIds: [999]
      })
    });

    expect(response.status).toBe(404);
  } finally {
    await server.close();
  }

  const conflictApplication = express();

  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      cancelOrdersByAdminHandler: async () => {
        throw new AdminOrderConflictError("Delivered orders cannot be cancelled");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders/delivered/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        orderIds: [8]
      })
    });

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});

test("PUT /admin/orders/:orderNumber/cancel returns the success payload and passes the admin actor", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/orders",
    createAdminOrdersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      cancelOrdersByAdminHandler: async (input): Promise<CancelAdminOrdersResponse> => {
        expect(input).toEqual({
          orderNumber: "QfRkbH41t27wDHVj",
          orderIds: [1, 6],
          reason: "Fraud review",
          actedByAdminUserId: "admin-user-id"
        });

        return {
          message: "Order cancelled"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/orders/%20QfRkbH41t27wDHVj%20/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        orderIds: [1, 6],
        reason: "  Fraud review  "
      })
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Order cancelled"
    });
  } finally {
    await server.close();
  }
});
