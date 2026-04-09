import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminSubscriptionsRouter } from "../../src/modules/admin-subscriptions/routes";
import { listAdminSubscriptions } from "../../src/modules/admin-subscriptions/service";
import { AdminSubscriptionsResponse } from "../../src/modules/admin-subscriptions/types";

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

test("listAdminSubscriptions groups seller and logistic plans into the expected response keys", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listAdminSubscriptions({
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      executedQueries.push({ text, params });

      return createQueryResult([
        {
          id: 6,
          name: "Basic",
          description: "Logistics starter plan",
          price: "0",
          currency: "NGN",
          duration: 0,
          maxProduct: 0,
          maxMonthlyOrder: 0,
          maxMonthlyDelivery: 10,
          maxSocialPosts: null,
          status: 1,
          type: "logistic"
        },
        {
          id: 1,
          name: "Basic",
          description: "Seller starter plan",
          price: "0",
          currency: "NGN",
          duration: 0,
          maxProduct: 10,
          maxMonthlyOrder: 10,
          maxMonthlyDelivery: 0,
          maxSocialPosts: null,
          status: 1,
          type: "seller"
        },
        {
          id: 2,
          name: "Standard",
          description: "Seller growth plan",
          price: 2500,
          currency: "NGN",
          duration: 1,
          maxProduct: 50,
          maxMonthlyOrder: 100,
          maxMonthlyDelivery: 0,
          maxSocialPosts: null,
          status: 1,
          type: "seller"
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(response).toEqual({
    seller: [
      {
        id: 1,
        name: "Basic",
        description: "Seller starter plan",
        price: 0,
        currency: "NGN",
        duration: 0,
        maxProduct: 10,
        maxMonthlyOrder: 10,
        maxMonthlyDelivery: 0,
        maxSocialPosts: null,
        status: 1
      },
      {
        id: 2,
        name: "Standard",
        description: "Seller growth plan",
        price: 2500,
        currency: "NGN",
        duration: 1,
        maxProduct: 50,
        maxMonthlyOrder: 100,
        maxMonthlyDelivery: 0,
        maxSocialPosts: null,
        status: 1
      }
    ],
    logistics: [
      {
        id: 6,
        name: "Basic",
        description: "Logistics starter plan",
        price: 0,
        currency: "NGN",
        duration: 0,
        maxProduct: 0,
        maxMonthlyOrder: 0,
        maxMonthlyDelivery: 10,
        maxSocialPosts: null,
        status: 1
      }
    ]
  });
  expect(executedQueries).toHaveLength(1);
  expect(executedQueries[0]?.text).toContain("FROM public.subscription s");
  expect(executedQueries[0]?.text).toContain("WHERE s.type IN ('seller', 'logistic')");
});

test("listAdminSubscriptions returns empty arrays when there are no matching subscription rows", async () => {
  const response = await listAdminSubscriptions({
    queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
      createQueryResult([]) as unknown as QueryResult<T>
  });

  expect(response).toEqual({
    seller: [],
    logistics: []
  });
});

test("GET /admin/subscriptions returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/subscriptions returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listAdminSubscriptionsHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/subscriptions returns the grouped subscriptions payload", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminSubscriptionsHandler: async (): Promise<AdminSubscriptionsResponse> => ({
        seller: [
          {
            id: 1,
            name: "Basic",
            description: "Seller starter plan",
            price: 0,
            currency: "NGN",
            duration: 0,
            maxProduct: 10,
            maxMonthlyOrder: 10,
            maxMonthlyDelivery: 0,
            maxSocialPosts: null,
            status: 1
          }
        ],
        logistics: [
          {
            id: 6,
            name: "Basic",
            description: "Logistics starter plan",
            price: 0,
            currency: "NGN",
            duration: 0,
            maxProduct: 0,
            maxMonthlyOrder: 0,
            maxMonthlyDelivery: 10,
            maxSocialPosts: null,
            status: 1
          }
        ]
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      seller: [
        {
          id: 1,
          name: "Basic",
          description: "Seller starter plan",
          price: 0,
          currency: "NGN",
          duration: 0,
          maxProduct: 10,
          maxMonthlyOrder: 10,
          maxMonthlyDelivery: 0,
          maxSocialPosts: null,
          status: 1
        }
      ],
      logistics: [
        {
          id: 6,
          name: "Basic",
          description: "Logistics starter plan",
          price: 0,
          currency: "NGN",
          duration: 0,
          maxProduct: 0,
          maxMonthlyOrder: 0,
          maxMonthlyDelivery: 10,
          maxSocialPosts: null,
          status: 1
        }
      ]
    });
  } finally {
    await server.close();
  }
});
