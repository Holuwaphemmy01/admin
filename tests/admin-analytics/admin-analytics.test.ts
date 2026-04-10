import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminAnalyticsRouter } from "../../src/modules/admin-analytics/routes";
import {
  AdminAnalyticsOverviewValidationError,
  getAdminAnalyticsOverview
} from "../../src/modules/admin-analytics/service";
import { AdminAnalyticsOverviewResponse } from "../../src/modules/admin-analytics/types";

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

test("getAdminAnalyticsOverview maps the aggregate dashboard metrics for a monthly period", async () => {
  const fixedNow = new Date("2026-04-10T16:00:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getAdminAnalyticsOverview("monthly", {
    nowFactory: () => fixedNow,
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      executedQueries.push({ text, params });

      return createQueryResult([
        {
          totalUsers: 125,
          totalOrders: "42",
          totalRevenue: "377145.88",
          activeStores: 39,
          activeLogistics: "14",
          pendingKyc: 7,
          openTickets: 11
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(response).toEqual({
    totalUsers: 125,
    totalOrders: 42,
    totalRevenue: 377145.88,
    activeStores: 39,
    activeLogistics: 14,
    pendingKyc: 7,
    openTickets: 11
  });
  expect(executedQueries).toHaveLength(1);
  expect(executedQueries[0]?.text).toContain("WITH bounds AS (");
  expect(executedQueries[0]?.text).toContain("date_trunc('month', $1::timestamptz)");
  expect(executedQueries[0]?.text).toContain('FROM public."user" u');
  expect(executedQueries[0]?.text).toContain("FROM public.order_tb o");
  expect(executedQueries[0]?.text).toContain("FROM public.earnings e");
  expect(executedQueries[0]?.text).toContain("FROM pending_submissions ps");
  expect(executedQueries[0]?.text).toContain("COALESCE(st.reply, false) = false");
  expect(executedQueries[0]?.params).toEqual([fixedNow, "monthly"]);
});

test("getAdminAnalyticsOverview defaults to all_time and validates unsupported periods", async () => {
  const fixedNow = new Date("2026-04-10T16:30:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getAdminAnalyticsOverview(undefined, {
    nowFactory: () => fixedNow,
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      executedQueries.push({ text, params });

      return createQueryResult([
        {
          totalUsers: 0,
          totalOrders: 0,
          totalRevenue: 0,
          activeStores: 0,
          activeLogistics: 0,
          pendingKyc: 0,
          openTickets: 0
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(response).toEqual({
    totalUsers: 0,
    totalOrders: 0,
    totalRevenue: 0,
    activeStores: 0,
    activeLogistics: 0,
    pendingKyc: 0,
    openTickets: 0
  });
  expect(executedQueries[0]?.params).toEqual([fixedNow, "all_time"]);

  await expect(getAdminAnalyticsOverview("yearly")).rejects.toThrow(
    AdminAnalyticsOverviewValidationError
  );
});

test("GET /admin/analytics/overview returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/analytics",
    createAdminAnalyticsRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/analytics/overview`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/analytics/overview returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/analytics",
    createAdminAnalyticsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      getAdminAnalyticsOverviewHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/analytics/overview`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/analytics/overview validates the optional period query and maps service validation errors", async () => {
  let server;
  const validationApplication = express();

  validationApplication.use(
    "/admin/analytics",
    createAdminAnalyticsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getAdminAnalyticsOverviewHandler: async () => {
        throw new AdminAnalyticsOverviewValidationError(
          "period must be one of daily, weekly, monthly, all_time"
        );
      }
    })
  );

  server = await startTestServer(validationApplication);

  try {
    let response = await fetch(`${server.baseUrl}/admin/analytics/overview?period=yearly`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "period must be one of daily, weekly, monthly, all_time"
    });

    response = await fetch(`${server.baseUrl}/admin/analytics/overview?period=%20%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "period must be one of daily, weekly, monthly, all_time"
    });

    response = await fetch(`${server.baseUrl}/admin/analytics/overview`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "period must be one of daily, weekly, monthly, all_time"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/analytics/overview parses the period query and returns the dashboard payload", async () => {
  const application = express();

  application.use(
    "/admin/analytics",
    createAdminAnalyticsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getAdminAnalyticsOverviewHandler: async (
        period
      ): Promise<AdminAnalyticsOverviewResponse> => {
        expect(period).toBe("weekly");

        return {
          totalUsers: 125,
          totalOrders: 42,
          totalRevenue: 377145.88,
          activeStores: 39,
          activeLogistics: 14,
          pendingKyc: 7,
          openTickets: 11
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/analytics/overview?period=weekly`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      totalUsers: 125,
      totalOrders: 42,
      totalRevenue: 377145.88,
      activeStores: 39,
      activeLogistics: 14,
      pendingKyc: 7,
      openTickets: 11
    });
  } finally {
    await server.close();
  }
});
