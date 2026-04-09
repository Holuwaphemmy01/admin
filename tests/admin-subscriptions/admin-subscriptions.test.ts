import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminSubscriptionsRouter } from "../../src/modules/admin-subscriptions/routes";
import {
  AdminSubscriptionConflictError,
  AdminSubscriptionNotFoundError,
  AdminSubscriptionValidationError,
  createAdminSubscriptionPlan,
  deleteAdminSubscriptionPlan,
  listAdminSubscriptions,
  updateAdminSubscriptionPlan
} from "../../src/modules/admin-subscriptions/service";
import {
  AdminSubscriptionsResponse,
  CreateAdminSubscriptionPlanResponse,
  DeleteAdminSubscriptionPlanResponse,
  UpdateAdminSubscriptionPlanResponse
} from "../../src/modules/admin-subscriptions/types";

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
  expect(executedQueries[0]?.text).toContain("AND COALESCE(s.status, 1) = 1");
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

test("createAdminSubscriptionPlan creates an annual seller subscription plan and returns the created plan", async () => {
  const fixedNow = new Date("2026-04-09T14:00:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await createAdminSubscriptionPlan(
    {
      name: " Premium ",
      type: "seller",
      price: 120000,
      productLimit: 500,
      monthlyOrderLimit: 5000,
      features: [" Priority support ", "Unlimited analytics"]
    },
    {
      nowFactory: () => fixedNow,
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        executedQueries.push({ text, params });

        if (executedQueries.length === 1) {
          return createQueryResult([]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 2) {
          return createQueryResult([
            {
              id: 11,
              name: "Premium",
              description: JSON.stringify(["Priority support", "Unlimited analytics"]),
              price: "120000",
              currency: "NGN",
              duration: 12,
              maxProduct: 500,
              maxMonthlyOrder: 5000,
              maxMonthlyDelivery: null,
              status: 1,
              type: "seller"
            }
          ]) as unknown as QueryResult<T>;
        }

        throw new Error(`Unexpected query: ${text}`);
      }
    }
  );

  expect(response).toEqual({
    message: "Subscription plan created successfully",
    plan: {
      id: 11,
      name: "Premium",
      type: "seller",
      price: 120000,
      currency: "NGN",
      duration: 12,
      productLimit: 500,
      monthlyOrderLimit: 5000,
      features: ["Priority support", "Unlimited analytics"],
      status: 1
    }
  });
  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("FROM public.subscription s");
  expect(executedQueries[0]?.params).toEqual(["Premium", "seller", 12]);
  expect(executedQueries[1]?.text).toContain("INSERT INTO public.subscription");
  expect(executedQueries[1]?.params).toEqual([
    "Premium",
    JSON.stringify(["Priority support", "Unlimited analytics"]),
    120000,
    "NGN",
    12,
    500,
    5000,
    null,
    1,
    "seller",
    fixedNow
  ]);
});

test("createAdminSubscriptionPlan maps logistics plans onto the delivery limit column", async () => {
  const response = await createAdminSubscriptionPlan(
    {
      name: "Standard",
      type: "logistics",
      price: 50000,
      monthlyOrderLimit: 100,
      features: ["Assigned dispatch priority"]
    },
    {
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> => {
        if (text.includes("FROM public.subscription s")) {
          return createQueryResult([]) as unknown as QueryResult<T>;
        }

        if (text.includes("INSERT INTO public.subscription")) {
          return createQueryResult([
            {
              id: 12,
              name: "Standard",
              description: JSON.stringify(["Assigned dispatch priority"]),
              price: 50000,
              currency: "NGN",
              duration: 12,
              maxProduct: null,
              maxMonthlyOrder: null,
              maxMonthlyDelivery: 100,
              status: 1,
              type: "logistic"
            }
          ]) as unknown as QueryResult<T>;
        }

        throw new Error(`Unexpected query: ${text}`);
      }
    }
  );

  expect(response).toEqual({
    message: "Subscription plan created successfully",
    plan: {
      id: 12,
      name: "Standard",
      type: "logistics",
      price: 50000,
      currency: "NGN",
      duration: 12,
      productLimit: null,
      monthlyOrderLimit: 100,
      features: ["Assigned dispatch priority"],
      status: 1
    }
  });
});

test("createAdminSubscriptionPlan validates payloads, rejects duplicates, and handles unique-index conflicts", async () => {
  await expect(
    createAdminSubscriptionPlan({
      name: "   ",
      type: "seller",
      price: 120000
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    createAdminSubscriptionPlan({
      name: "Premium",
      type: "logistic" as never,
      price: 120000
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    createAdminSubscriptionPlan({
      name: "Premium",
      type: "seller",
      price: -1
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    createAdminSubscriptionPlan({
      name: "Premium",
      type: "seller",
      price: 120000,
      productLimit: -1
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    createAdminSubscriptionPlan({
      name: "Premium",
      type: "seller",
      price: 120000,
      features: ["ok", "   "]
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    createAdminSubscriptionPlan(
      {
        name: "Standard",
        type: "seller",
        price: 25000
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
          createQueryResult([{ id: 4 }]) as unknown as QueryResult<T>
      }
    )
  ).rejects.toThrow(AdminSubscriptionConflictError);

  await expect(
    createAdminSubscriptionPlan(
      {
        name: "New Plan",
        type: "seller",
        price: 25000
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> => {
          if (text.includes("FROM public.subscription s")) {
            return createQueryResult([]) as unknown as QueryResult<T>;
          }

          const error = new Error("duplicate key") as Error & { code?: string };
          error.code = "23505";
          throw error;
        }
      }
    )
  ).rejects.toThrow(AdminSubscriptionConflictError);

  await expect(
    createAdminSubscriptionPlan(
      {
        name: "New Plan",
        type: "seller",
        price: 25000
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> => {
          if (text.includes("FROM public.subscription s")) {
            return createQueryResult([]) as unknown as QueryResult<T>;
          }

          if (text.includes("INSERT INTO public.subscription")) {
            return createQueryResult([]) as unknown as QueryResult<T>;
          }

          throw new Error(`Unexpected query: ${text}`);
        }
      }
    )
  ).rejects.toThrow("Subscription plan insert did not return a row");
});

test("updateAdminSubscriptionPlan updates the provided fields and preserves the existing plan duration", async () => {
  const fixedNow = new Date("2026-04-09T15:00:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await updateAdminSubscriptionPlan(
    {
      id: 4,
      name: " Standard Plus ",
      price: 18000,
      features: [" Priority support ", "Dedicated onboarding"]
    },
    {
      nowFactory: () => fixedNow,
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        executedQueries.push({ text, params });

        if (executedQueries.length === 1) {
          return createQueryResult([
            {
              id: 4,
              name: "Standard",
              description: JSON.stringify(["Priority support"]),
              price: "15000",
              currency: "NGN",
              duration: 1,
              maxProduct: 100,
              maxMonthlyOrder: 250,
              maxMonthlyDelivery: null,
              status: 1,
              type: "seller"
            }
          ]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 2) {
          return createQueryResult([]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 3) {
          return createQueryResult([
            {
              id: 4,
              name: "Standard Plus",
              description: JSON.stringify(["Priority support", "Dedicated onboarding"]),
              price: "18000",
              currency: "NGN",
              duration: 1,
              maxProduct: 100,
              maxMonthlyOrder: 250,
              maxMonthlyDelivery: null,
              status: 1,
              type: "seller"
            }
          ]) as unknown as QueryResult<T>;
        }

        throw new Error(`Unexpected query: ${text}`);
      }
    }
  );

  expect(response).toEqual({
    message: "Plan updated",
    plan: {
      id: 4,
      name: "Standard Plus",
      type: "seller",
      price: 18000,
      currency: "NGN",
      duration: 1,
      productLimit: 100,
      monthlyOrderLimit: 250,
      features: ["Priority support", "Dedicated onboarding"],
      status: 1
    }
  });
  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[0]?.text).toContain("WHERE s.id = $1");
  expect(executedQueries[0]?.params).toEqual([4]);
  expect(executedQueries[1]?.text).toContain("AND s.id <> $4");
  expect(executedQueries[1]?.params).toEqual(["Standard Plus", "seller", 1, 4]);
  expect(executedQueries[2]?.text).toContain("UPDATE public.subscription");
  expect(executedQueries[2]?.params).toEqual([
    "Standard Plus",
    JSON.stringify(["Priority support", "Dedicated onboarding"]),
    18000,
    100,
    250,
    null,
    fixedNow,
    4
  ]);
});

test("updateAdminSubscriptionPlan maps logistics monthly order limits onto the delivery column", async () => {
  const fixedNow = new Date("2026-04-09T15:30:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await updateAdminSubscriptionPlan(
    {
      id: 9,
      productLimit: 0,
      monthlyOrderLimit: 180
    },
    {
      nowFactory: () => fixedNow,
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        executedQueries.push({ text, params });

        if (executedQueries.length === 1) {
          return createQueryResult([
            {
              id: 9,
              name: "Logistics Standard",
              description: JSON.stringify(["Assigned dispatch priority"]),
              price: "50000",
              currency: "NGN",
              duration: 12,
              maxProduct: null,
              maxMonthlyOrder: null,
              maxMonthlyDelivery: 120,
              status: 1,
              type: "logistic"
            }
          ]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 2) {
          return createQueryResult([
            {
              id: 9,
              name: "Logistics Standard",
              description: JSON.stringify(["Assigned dispatch priority"]),
              price: "50000",
              currency: "NGN",
              duration: 12,
              maxProduct: 0,
              maxMonthlyOrder: null,
              maxMonthlyDelivery: 180,
              status: 1,
              type: "logistic"
            }
          ]) as unknown as QueryResult<T>;
        }

        throw new Error(`Unexpected query: ${text}`);
      }
    }
  );

  expect(response).toEqual({
    message: "Plan updated",
    plan: {
      id: 9,
      name: "Logistics Standard",
      type: "logistics",
      price: 50000,
      currency: "NGN",
      duration: 12,
      productLimit: 0,
      monthlyOrderLimit: 180,
      features: ["Assigned dispatch priority"],
      status: 1
    }
  });
  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("WHERE s.id = $1");
  expect(executedQueries[1]?.text).toContain("UPDATE public.subscription");
  expect(executedQueries[1]?.params).toEqual([
    "Logistics Standard",
    JSON.stringify(["Assigned dispatch priority"]),
    50000,
    0,
    null,
    180,
    fixedNow,
    9
  ]);
});

test("updateAdminSubscriptionPlan validates payloads and maps not found or duplicate conflicts", async () => {
  await expect(
    updateAdminSubscriptionPlan({
      id: 0,
      price: 50000
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    updateAdminSubscriptionPlan({
      id: 1
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    updateAdminSubscriptionPlan({
      id: 1,
      name: "   "
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    updateAdminSubscriptionPlan({
      id: 1,
      price: 1000.001
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    updateAdminSubscriptionPlan({
      id: 1,
      productLimit: -1
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    updateAdminSubscriptionPlan({
      id: 1,
      monthlyOrderLimit: -1
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    updateAdminSubscriptionPlan({
      id: 1,
      features: ["Valid", "   "]
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    updateAdminSubscriptionPlan(
      {
        id: 99,
        price: 50000
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
          createQueryResult([]) as unknown as QueryResult<T>
      }
    )
  ).rejects.toThrow(AdminSubscriptionNotFoundError);

  await expect(
    updateAdminSubscriptionPlan(
      {
        id: 4,
        name: "Premium"
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> => {
          if (text.includes("WHERE s.id = $1")) {
            return createQueryResult([
              {
                id: 4,
                name: "Standard",
                description: JSON.stringify(["Priority support"]),
                price: 15000,
                currency: "NGN",
                duration: 1,
                maxProduct: 100,
                maxMonthlyOrder: 250,
                maxMonthlyDelivery: null,
                status: 1,
                type: "seller"
              }
            ]) as unknown as QueryResult<T>;
          }

          if (text.includes("AND s.id <> $4")) {
            return createQueryResult([{ id: 3 }]) as unknown as QueryResult<T>;
          }

          throw new Error(`Unexpected query: ${text}`);
        }
      }
    )
  ).rejects.toThrow(AdminSubscriptionConflictError);

  await expect(
    updateAdminSubscriptionPlan(
      {
        id: 4,
        name: "Premium"
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> => {
          if (text.includes("WHERE s.id = $1")) {
            return createQueryResult([
              {
                id: 4,
                name: "Standard",
                description: JSON.stringify(["Priority support"]),
                price: 15000,
                currency: "NGN",
                duration: 1,
                maxProduct: 100,
                maxMonthlyOrder: 250,
                maxMonthlyDelivery: null,
                status: 1,
                type: "seller"
              }
            ]) as unknown as QueryResult<T>;
          }

          if (text.includes("AND s.id <> $4")) {
            return createQueryResult([]) as unknown as QueryResult<T>;
          }

          const error = new Error("duplicate key") as Error & { code?: string };
          error.code = "23505";
          throw error;
        }
      }
    )
  ).rejects.toThrow(AdminSubscriptionConflictError);

  await expect(
    updateAdminSubscriptionPlan(
      {
        id: 4,
        price: 17000
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> => {
          if (text.includes("WHERE s.id = $1")) {
            return createQueryResult([
              {
                id: 4,
                name: "Standard",
                description: JSON.stringify(["Priority support"]),
                price: 15000,
                currency: "NGN",
                duration: 1,
                maxProduct: 100,
                maxMonthlyOrder: 250,
                maxMonthlyDelivery: null,
                status: 1,
                type: "seller"
              }
            ]) as unknown as QueryResult<T>;
          }

          if (text.includes("UPDATE public.subscription")) {
            return createQueryResult([]) as unknown as QueryResult<T>;
          }

          throw new Error(`Unexpected query: ${text}`);
        }
      }
    )
  ).rejects.toThrow(AdminSubscriptionNotFoundError);
});

test("deleteAdminSubscriptionPlan marks an active subscription plan as removed", async () => {
  const fixedNow = new Date("2026-04-09T16:00:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await deleteAdminSubscriptionPlan(
    {
      id: 12
    },
    {
      nowFactory: () => fixedNow,
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        executedQueries.push({ text, params });

        return createQueryResult([
          {
            id: 12
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(response).toEqual({
    message: "Plan removed"
  });
  expect(executedQueries).toHaveLength(1);
  expect(executedQueries[0]?.text).toContain("UPDATE public.subscription");
  expect(executedQueries[0]?.text).toContain("COALESCE(status, 1) = 1");
  expect(executedQueries[0]?.params).toEqual([fixedNow, 12]);
});

test("deleteAdminSubscriptionPlan validates the id and maps missing plans", async () => {
  await expect(
    deleteAdminSubscriptionPlan({
      id: 0
    })
  ).rejects.toThrow(AdminSubscriptionValidationError);

  await expect(
    deleteAdminSubscriptionPlan(
      {
        id: 999
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
          createQueryResult([]) as unknown as QueryResult<T>
      }
    )
  ).rejects.toThrow(AdminSubscriptionNotFoundError);
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

test("POST /admin/subscriptions/plans returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Premium",
        type: "seller",
        price: 120000
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("POST /admin/subscriptions/plans returns 403 for non-super-admins", async () => {
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
      createAdminSubscriptionPlanHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Premium",
        type: "seller",
        price: 120000
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("POST /admin/subscriptions/plans validates the request body", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createAdminSubscriptionPlanHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/subscriptions/plans`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "seller",
        price: 120000
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "name is required and must be a non-empty string"
    });

    response = await fetch(`${server.baseUrl}/admin/subscriptions/plans`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Premium",
        type: "logistic",
        price: 120000
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "type is required and must be one of seller, logistics"
    });

    response = await fetch(`${server.baseUrl}/admin/subscriptions/plans`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Premium",
        type: "seller",
        price: 120000.001
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message:
        "price is required and must be a non-negative finite number with at most 2 decimal places"
    });

    response = await fetch(`${server.baseUrl}/admin/subscriptions/plans`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Premium",
        type: "seller",
        price: 120000,
        productLimit: -1
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "productLimit must be a non-negative integer when provided"
    });

    response = await fetch(`${server.baseUrl}/admin/subscriptions/plans`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Premium",
        type: "seller",
        price: 120000,
        features: ["Priority support", "   "]
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "features must be an array of non-empty strings when provided"
    });
  } finally {
    await server.close();
  }
});

test("POST /admin/subscriptions/plans maps duplicate conflicts", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createAdminSubscriptionPlanHandler: async () => {
        throw new AdminSubscriptionConflictError(
          "An active annual subscription plan with this name and type already exists"
        );
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Premium",
        type: "seller",
        price: 120000
      })
    });

    expect(response.status).toBe(409);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "An active annual subscription plan with this name and type already exists"
    });
  } finally {
    await server.close();
  }
});

test("POST /admin/subscriptions/plans returns the success payload and passes trimmed values", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createAdminSubscriptionPlanHandler: async (
        payload
      ): Promise<CreateAdminSubscriptionPlanResponse> => {
        expect(payload).toEqual({
          name: "Premium",
          type: "logistics",
          price: 50000,
          productLimit: 0,
          monthlyOrderLimit: 100,
          features: ["Assigned dispatch priority", "Weekend coverage"]
        });

        return {
          message: "Subscription plan created successfully",
          plan: {
            id: 12,
            name: "Premium",
            type: "logistics",
            price: 50000,
            currency: "NGN",
            duration: 12,
            productLimit: 0,
            monthlyOrderLimit: 100,
            features: ["Assigned dispatch priority", "Weekend coverage"],
            status: 1
          }
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: " Premium ",
        type: "logistics",
        price: 50000,
        productLimit: 0,
        monthlyOrderLimit: 100,
        features: [" Assigned dispatch priority ", "Weekend coverage"]
      })
    });

    expect(response.status).toBe(201);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Subscription plan created successfully",
      plan: {
        id: 12,
        name: "Premium",
        type: "logistics",
        price: 50000,
        currency: "NGN",
        duration: 12,
        productLimit: 0,
        monthlyOrderLimit: 100,
        features: ["Assigned dispatch priority", "Weekend coverage"],
        status: 1
      }
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/subscriptions/plans/:id returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/5`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price: 50000
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/subscriptions/plans/:id returns 403 for non-super-admins", async () => {
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
      updateAdminSubscriptionPlanHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/5`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price: 50000
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/subscriptions/plans/:id validates the path and request body", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateAdminSubscriptionPlanHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/abc`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price: 50000
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "id must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/5`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "At least one subscription plan field must be provided for update"
    });

    response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/5`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "   "
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "name must be a non-empty string when provided"
    });

    response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/5`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price: 50000.001
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message:
        "price must be a non-negative finite number with at most 2 decimal places when provided"
    });

    response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/5`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        productLimit: -1
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "productLimit must be a non-negative integer when provided"
    });

    response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/5`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        monthlyOrderLimit: -1
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "monthlyOrderLimit must be a non-negative integer when provided"
    });

    response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/5`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        features: ["Priority support", "   "]
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "features must be an array of non-empty strings when provided"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/subscriptions/plans/:id maps 404 and 409 errors", async () => {
  let server;
  const notFoundApplication = express();
  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateAdminSubscriptionPlanHandler: async () => {
        throw new AdminSubscriptionNotFoundError("Subscription plan not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/5`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price: 50000
      })
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Subscription plan not found"
    });
  } finally {
    await server.close();
  }

  const conflictApplication = express();
  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateAdminSubscriptionPlanHandler: async () => {
        throw new AdminSubscriptionConflictError(
          "An active subscription plan with this name, type, and duration already exists"
        );
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/5`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Premium"
      })
    });

    expect(response.status).toBe(409);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "An active subscription plan with this name, type, and duration already exists"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/subscriptions/plans/:id returns the success payload and passes trimmed values", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateAdminSubscriptionPlanHandler: async (
        payload
      ): Promise<UpdateAdminSubscriptionPlanResponse> => {
        expect(payload).toEqual({
          id: 12,
          name: "Premium Plus",
          price: 150000,
          productLimit: 600,
          monthlyOrderLimit: 6000,
          features: ["Priority support", "Weekend coverage"]
        });

        return {
          message: "Plan updated",
          plan: {
            id: 12,
            name: "Premium Plus",
            type: "seller",
            price: 150000,
            currency: "NGN",
            duration: 12,
            productLimit: 600,
            monthlyOrderLimit: 6000,
            features: ["Priority support", "Weekend coverage"],
            status: 1
          }
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/12`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: " Premium Plus ",
        price: 150000,
        productLimit: 600,
        monthlyOrderLimit: 6000,
        features: [" Priority support ", "Weekend coverage"]
      })
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Plan updated",
      plan: {
        id: 12,
        name: "Premium Plus",
        type: "seller",
        price: 150000,
        currency: "NGN",
        duration: 12,
        productLimit: 600,
        monthlyOrderLimit: 6000,
        features: ["Priority support", "Weekend coverage"],
        status: 1
      }
    });
  } finally {
    await server.close();
  }
});

test("DELETE /admin/subscriptions/plans/:id returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/12`, {
      method: "DELETE"
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("DELETE /admin/subscriptions/plans/:id returns 403 for non-super-admins", async () => {
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
      deleteAdminSubscriptionPlanHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/12`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("DELETE /admin/subscriptions/plans/:id validates the id and maps not found", async () => {
  let server;
  const validationApplication = express();
  validationApplication.use(express.json());
  validationApplication.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      deleteAdminSubscriptionPlanHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  server = await startTestServer(validationApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/abc`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "id must be a positive integer"
    });
  } finally {
    await server.close();
  }

  const notFoundApplication = express();
  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      deleteAdminSubscriptionPlanHandler: async () => {
        throw new AdminSubscriptionNotFoundError("Subscription plan not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/12`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Subscription plan not found"
    });
  } finally {
    await server.close();
  }
});

test("DELETE /admin/subscriptions/plans/:id returns the success payload", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/subscriptions",
    createAdminSubscriptionsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      deleteAdminSubscriptionPlanHandler: async (
        payload
      ): Promise<DeleteAdminSubscriptionPlanResponse> => {
        expect(payload).toEqual({
          id: 12
        });

        return {
          message: "Plan removed"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/subscriptions/plans/12`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Plan removed"
    });
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
