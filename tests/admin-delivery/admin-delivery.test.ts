import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminDeliveryRouter } from "../../src/modules/admin-delivery/routes";
import {
  createDeliveryPricing,
  deleteDeliveryPricing,
  getDeliverySurgeOverview,
  listDeliveryPricing,
  DeliveryPricingConflictError,
  DeliveryPricingNotFoundError,
  DeliveryPricingValidationError
} from "../../src/modules/admin-delivery/service";
import { updateDeliveryPricing } from "../../src/modules/admin-delivery/service";
import {
  CreateDeliveryPricingResponse,
  DeleteDeliveryPricingResponse,
  DeliverySurgeOverviewResponse,
  ListDeliveryPricingResponse,
  UpdateDeliveryPricingResponse
} from "../../src/modules/admin-delivery/types";

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

test("createDeliveryPricing creates a delivery pricing row and returns the created record", async () => {
  const fixedNow = new Date("2026-04-09T12:30:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await createDeliveryPricing(
    {
      state: " Lagos ",
      vehicleType: "bike",
      baseFee: 1000
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
              id: 4,
              state: "Lagos",
              vehicleType: "bike",
              baseFee: "1000"
            }
          ]) as unknown as QueryResult<T>;
        }

        throw new Error(`Unexpected query: ${text}`);
      }
    }
  );

  expect(response).toEqual({
    message: "Delivery pricing added successfully",
    data: {
      id: 4,
      state: "Lagos",
      vehicleType: "bike",
      baseFee: 1000
    }
  });
  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("FROM public.delivery_pricings dp");
  expect(executedQueries[0]?.params).toEqual(["Lagos", "bike"]);
  expect(executedQueries[1]?.text).toContain("INSERT INTO public.delivery_pricings");
  expect(executedQueries[1]?.params).toEqual(["Lagos", "bike", 1000, 1, fixedNow, fixedNow]);
});

test("createDeliveryPricing validates the payload and rejects duplicate state and vehicle combinations", async () => {
  await expect(
    createDeliveryPricing({
      state: "   ",
      vehicleType: "bike",
      baseFee: 1000
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    createDeliveryPricing({
      state: "Lagos",
      vehicleType: "van" as never,
      baseFee: 1000
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    createDeliveryPricing({
      state: "Lagos",
      vehicleType: "bike",
      baseFee: -1
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    createDeliveryPricing({
      state: "Lagos",
      vehicleType: "bike",
      baseFee: 100.001
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    createDeliveryPricing(
      {
        state: "Lagos",
        vehicleType: "car",
        baseFee: 900
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
          createQueryResult([
            {
              id: 3
            }
          ]) as unknown as QueryResult<T>
      }
    )
  ).rejects.toThrow(DeliveryPricingConflictError);
});

test("createDeliveryPricing fails cleanly when the insert does not return a created row", async () => {
  await expect(
    createDeliveryPricing(
      {
        state: "Abuja",
        vehicleType: "truck",
        baseFee: 2500
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> => {
          if (text.includes("FROM public.delivery_pricings dp")) {
            return createQueryResult([]) as unknown as QueryResult<T>;
          }

          if (text.includes("INSERT INTO public.delivery_pricings")) {
            return createQueryResult([]) as unknown as QueryResult<T>;
          }

          throw new Error(`Unexpected query: ${text}`);
        }
      }
    )
  ).rejects.toThrow("Delivery pricing insert did not return a row");
});

test("updateDeliveryPricing updates provided fields and preserves unspecified values", async () => {
  const fixedNow = new Date("2026-04-09T13:00:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await updateDeliveryPricing(
    {
      id: 2,
      state: " Abuja ",
      baseFee: 1200
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
              id: 2,
              state: "Lagos",
              vehicleType: "car",
              baseFee: "900"
            }
          ]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 2) {
          return createQueryResult([]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 3) {
          return createQueryResult([
            {
              id: 2,
              state: "Abuja",
              vehicleType: "car",
              baseFee: "1200"
            }
          ]) as unknown as QueryResult<T>;
        }

        throw new Error(`Unexpected query: ${text}`);
      }
    }
  );

  expect(response).toEqual({
    message: "Delivery pricing updated successfully",
    data: {
      id: 2,
      state: "Abuja",
      vehicleType: "car",
      baseFee: 1200
    }
  });
  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[0]?.text).toContain("WHERE dp.id = $1");
  expect(executedQueries[0]?.params).toEqual([2]);
  expect(executedQueries[1]?.text).toContain("AND dp.id <> $3");
  expect(executedQueries[1]?.params).toEqual(["Abuja", "car", 2]);
  expect(executedQueries[2]?.text).toContain("UPDATE public.delivery_pricings");
  expect(executedQueries[2]?.params).toEqual(["Abuja", "car", 1200, fixedNow, 2]);
});

test("updateDeliveryPricing validates inputs and maps not-found or duplicate conflicts", async () => {
  await expect(
    updateDeliveryPricing({
      id: 0,
      state: "Lagos"
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    updateDeliveryPricing({
      id: 1
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    updateDeliveryPricing({
      id: 1,
      state: "   "
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    updateDeliveryPricing({
      id: 1,
      vehicleType: "van" as never
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    updateDeliveryPricing({
      id: 1,
      baseFee: 10.001
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    updateDeliveryPricing(
      {
        id: 3,
        vehicleType: "truck"
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
          createQueryResult([]) as unknown as QueryResult<T>
      }
    )
  ).rejects.toThrow(DeliveryPricingNotFoundError);

  await expect(
    updateDeliveryPricing(
      {
        id: 3,
        vehicleType: "truck"
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> => {
          if (text.includes("WHERE dp.id = $1")) {
            return createQueryResult([
              {
                id: 3,
                state: "Lagos",
                vehicleType: "car",
                baseFee: 900
              }
            ]) as unknown as QueryResult<T>;
          }

          if (text.includes("AND dp.id <> $3")) {
            return createQueryResult([
              {
                id: 1
              }
            ]) as unknown as QueryResult<T>;
          }

          throw new Error(`Unexpected query: ${text}`);
        }
      }
    )
  ).rejects.toThrow(DeliveryPricingConflictError);
});

test("deleteDeliveryPricing removes a pricing rule and validates not-found inputs", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await deleteDeliveryPricing(
    {
      id: 2
    },
    {
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        executedQueries.push({ text, params });

        return createQueryResult([
          {
            id: 2
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(response).toEqual({
    message: "Pricing rule removed"
  });
  expect(executedQueries).toHaveLength(1);
  expect(executedQueries[0]?.text).toContain("DELETE FROM public.delivery_pricings");
  expect(executedQueries[0]?.params).toEqual([2]);

  await expect(
    deleteDeliveryPricing({
      id: 0
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    deleteDeliveryPricing(
      {
        id: 99
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
          createQueryResult([]) as unknown as QueryResult<T>
      }
    )
  ).rejects.toThrow(DeliveryPricingNotFoundError);
});

test("getDeliverySurgeOverview returns the strongest active surge factor, fuel surcharge, and latest update time", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getDeliverySurgeOverview({
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      executedQueries.push({ text, params });

      if (text.includes("FROM public.delivery_general_surge_surcharge dgs")) {
        return createQueryResult([
          {
            condition: "publicHoliday",
            rate: "1.25",
            updatedAt: new Date("2026-04-09T09:00:00.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }

      if (text.includes("FROM public.delivery_fuel_surge_surcharge dfs")) {
        return createQueryResult([
          {
            fuelSurcharge: "6.40",
            updatedAt: new Date("2026-04-09T10:00:00.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }

      throw new Error(`Unexpected query: ${text}`);
    }
  });

  expect(response).toEqual({
    surgeFactor: 1.25,
    fuelSurcharge: 6.4,
    reason: "publicHoliday",
    updatedAt: "2026-04-09T10:00:00.000Z"
  });
  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("FROM public.delivery_general_surge_surcharge dgs");
  expect(executedQueries[1]?.text).toContain("FROM public.delivery_fuel_surge_surcharge dfs");
});

test("getDeliverySurgeOverview returns defaults when no active surge config exists", async () => {
  const response = await getDeliverySurgeOverview({
    queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
      createQueryResult([]) as unknown as QueryResult<T>
  });

  expect(response).toEqual({
    surgeFactor: 1,
    fuelSurcharge: 0,
    reason: null,
    updatedAt: null
  });
});

test("listDeliveryPricing returns mapped pricing rules with stable ordering and optional filters", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listDeliveryPricing(
    {
      state: " Lagos ",
      vehicleType: "bike"
    },
    {
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        executedQueries.push({ text, params });

        return createQueryResult([
          {
            id: 1,
            state: "Lagos",
            vehicleType: "bike",
            baseFee: "500"
          },
          {
            id: 2,
            state: "Lagos",
            vehicleType: "bike",
            baseFee: 700
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(response).toEqual({
    pricingRules: [
      {
        id: 1,
        state: "Lagos",
        vehicleType: "bike",
        baseFee: 500
      },
      {
        id: 2,
        state: "Lagos",
        vehicleType: "bike",
        baseFee: 700
      }
    ]
  });
  expect(executedQueries).toHaveLength(1);
  expect(executedQueries[0]?.text).toContain("FROM public.delivery_pricings dp");
  expect(executedQueries[0]?.text).toContain('ORDER BY LOWER(BTRIM(dp.state)) ASC');
  expect(executedQueries[0]?.params).toEqual(["Lagos", "bike"]);
});

test("listDeliveryPricing validates optional filters and returns an empty array when nothing matches", async () => {
  await expect(
    listDeliveryPricing({
      state: "   "
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  await expect(
    listDeliveryPricing({
      vehicleType: "van" as never
    })
  ).rejects.toThrow(DeliveryPricingValidationError);

  const response = await listDeliveryPricing(
    {},
    {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([]) as unknown as QueryResult<T>
    }
  );

  expect(response).toEqual({
    pricingRules: []
  });
});

test("POST /admin/delivery/pricing returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: "Lagos",
        vehicleType: "bike",
        baseFee: 1000
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/delivery/pricing returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/delivery/surge returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/surge`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/delivery/surge returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      getDeliverySurgeOverviewHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/surge`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/delivery/surge returns the current surge overview payload", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getDeliverySurgeOverviewHandler: async (): Promise<DeliverySurgeOverviewResponse> => ({
        surgeFactor: 1.4,
        fuelSurcharge: 2.64,
        reason: "feastivePeaks",
        updatedAt: "2026-04-09T11:00:00.000Z"
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/surge`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      surgeFactor: 1.4,
      fuelSurcharge: 2.64,
      reason: "feastivePeaks",
      updatedAt: "2026-04-09T11:00:00.000Z"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/delivery/pricing returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listDeliveryPricingHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/delivery/pricing validates query filters", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listDeliveryPricingHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/delivery/pricing?state=%20%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "state must be a non-empty string when provided"
    });

    response = await fetch(`${server.baseUrl}/admin/delivery/pricing?vehicleType=van`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "vehicleType must be one of bike, car, truck when provided"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/delivery/pricing returns the success payload and passes trimmed filters", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listDeliveryPricingHandler: async (filters): Promise<ListDeliveryPricingResponse> => {
        expect(filters).toEqual({
          state: "Lagos",
          vehicleType: "bike"
        });

        return {
          pricingRules: [
            {
              id: 1,
              state: "Lagos",
              vehicleType: "bike",
              baseFee: 500
            }
          ]
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/delivery/pricing?state=%20Lagos%20&vehicleType=bike`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      pricingRules: [
        {
          id: 1,
          state: "Lagos",
          vehicleType: "bike",
          baseFee: 500
        }
      ]
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/delivery/pricing/:id returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing/1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        baseFee: 1200
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/delivery/pricing/:id returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "finance"
        })
      ),
      updateDeliveryPricingHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing/1`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        baseFee: 1200
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/delivery/pricing/:id validates the path and request body", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateDeliveryPricingHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/delivery/pricing/abc`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        baseFee: 1200
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "id must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/delivery/pricing/1`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "At least one delivery pricing field must be provided for update"
    });

    response = await fetch(`${server.baseUrl}/admin/delivery/pricing/1`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: "   "
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "state must be a non-empty string when provided"
    });

    response = await fetch(`${server.baseUrl}/admin/delivery/pricing/1`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        vehicleType: "van"
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "vehicleType must be one of bike, car, truck when provided"
    });

    response = await fetch(`${server.baseUrl}/admin/delivery/pricing/1`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        baseFee: 1000.001
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message:
        "baseFee must be a non-negative finite number with at most 2 decimal places when provided"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/delivery/pricing/:id maps 404 and 409 errors", async () => {
  let server;
  const notFoundApplication = express();
  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateDeliveryPricingHandler: async () => {
        throw new DeliveryPricingNotFoundError("Delivery pricing not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing/1`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        baseFee: 1200
      })
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Delivery pricing not found"
    });
  } finally {
    await server.close();
  }

  const conflictApplication = express();
  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateDeliveryPricingHandler: async () => {
        throw new DeliveryPricingConflictError(
          "Delivery pricing already exists for the provided state and vehicle type"
        );
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing/1`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        vehicleType: "bike"
      })
    });

    expect(response.status).toBe(409);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Delivery pricing already exists for the provided state and vehicle type"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/delivery/pricing/:id returns the success payload and passes trimmed values", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateDeliveryPricingHandler: async (
        payload
      ): Promise<UpdateDeliveryPricingResponse> => {
        expect(payload).toEqual({
          id: 2,
          state: "Abuja",
          vehicleType: "truck",
          baseFee: 1500
        });

        return {
          message: "Delivery pricing updated successfully",
          data: {
            id: 2,
            state: "Abuja",
            vehicleType: "truck",
            baseFee: 1500
          }
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing/2`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: " Abuja ",
        vehicleType: "truck",
        baseFee: 1500
      })
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Delivery pricing updated successfully",
      data: {
        id: 2,
        state: "Abuja",
        vehicleType: "truck",
        baseFee: 1500
      }
    });
  } finally {
    await server.close();
  }
});

test("DELETE /admin/delivery/pricing/:id returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing/1`, {
      method: "DELETE"
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("DELETE /admin/delivery/pricing/:id returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "finance"
        })
      ),
      deleteDeliveryPricingHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing/1`, {
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

test("DELETE /admin/delivery/pricing/:id validates the pricing id and maps not found", async () => {
  let server;
  const validationApplication = express();
  validationApplication.use(express.json());
  validationApplication.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      deleteDeliveryPricingHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  server = await startTestServer(validationApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing/abc`, {
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
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      deleteDeliveryPricingHandler: async () => {
        throw new DeliveryPricingNotFoundError("Delivery pricing not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing/4`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Delivery pricing not found"
    });
  } finally {
    await server.close();
  }
});

test("DELETE /admin/delivery/pricing/:id returns the success payload", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      deleteDeliveryPricingHandler: async (
        payload
      ): Promise<DeleteDeliveryPricingResponse> => {
        expect(payload).toEqual({
          id: 3
        });

        return {
          message: "Pricing rule removed"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing/3`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Pricing rule removed"
    });
  } finally {
    await server.close();
  }
});

test("POST /admin/delivery/pricing returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "finance"
        })
      ),
      createDeliveryPricingHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: "Lagos",
        vehicleType: "bike",
        baseFee: 1000
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("POST /admin/delivery/pricing validates the request body", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createDeliveryPricingHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/delivery/pricing`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        vehicleType: "bike",
        baseFee: 1000
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "state is required and must be a non-empty string"
    });

    response = await fetch(`${server.baseUrl}/admin/delivery/pricing`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: "Lagos",
        vehicleType: "van",
        baseFee: 1000
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "vehicleType must be one of bike, car, truck"
    });

    response = await fetch(`${server.baseUrl}/admin/delivery/pricing`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: "Lagos",
        vehicleType: "bike",
        baseFee: 1000.001
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message:
        "baseFee is required and must be a non-negative finite number with at most 2 decimal places"
    });
  } finally {
    await server.close();
  }
});

test("POST /admin/delivery/pricing maps delivery pricing conflicts", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createDeliveryPricingHandler: async () => {
        throw new DeliveryPricingConflictError(
          "Delivery pricing already exists for the provided state and vehicle type"
        );
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: "Lagos",
        vehicleType: "bike",
        baseFee: 1000
      })
    });

    expect(response.status).toBe(409);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Delivery pricing already exists for the provided state and vehicle type"
    });
  } finally {
    await server.close();
  }
});

test("POST /admin/delivery/pricing returns the success payload and passes trimmed values", async () => {
  const application = express();
  application.use(express.json());
  application.use(
    "/admin/delivery",
    createAdminDeliveryRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createDeliveryPricingHandler: async (
        payload
      ): Promise<CreateDeliveryPricingResponse> => {
        expect(payload).toEqual({
          state: "Lagos",
          vehicleType: "bike",
          baseFee: 1000
        });

        return {
          message: "Delivery pricing added successfully",
          data: {
            id: 4,
            state: "Lagos",
            vehicleType: "bike",
            baseFee: 1000
          }
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/delivery/pricing`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: " Lagos ",
        vehicleType: "bike",
        baseFee: 1000
      })
    });

    expect(response.status).toBe(201);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Delivery pricing added successfully",
      data: {
        id: 4,
        state: "Lagos",
        vehicleType: "bike",
        baseFee: 1000
      }
    });
  } finally {
    await server.close();
  }
});
