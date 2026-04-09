import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminCampaignsRouter } from "../../src/modules/admin-campaigns/routes";
import {
  AdminCampaignsValidationError,
  listAdminCampaigns
} from "../../src/modules/admin-campaigns/service";
import { AdminCampaignsListResponse } from "../../src/modules/admin-campaigns/types";

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

test("listAdminCampaigns maps promoted campaign rows into the admin response payload and total count", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listAdminCampaigns(
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
            id: 13,
            username: "hinocag",
            goal: "get_messages",
            status: "completed",
            budget: "5000.00",
            startDate: new Date("2026-03-08T23:12:00.000Z"),
            endDate: new Date("2026-03-23T23:12:00.000Z")
          },
          {
            id: 9,
            username: "Hormo2urs",
            goal: "visit_profile",
            status: "cancelled",
            budget: 1000,
            startDate: null,
            endDate: null
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_campaign ppc");
  expect(executedQueries[0]?.text).toContain('INNER JOIN public."user" u ON u.id = ppc."userId"');
  expect(executedQueries[0]?.text).toContain('ORDER BY ppc."createdAt" DESC, ppc.id DESC');
  expect(executedQueries[0]?.params).toEqual([20, 0]);
  expect(response).toEqual({
    campaigns: [
      {
        campaignId: "13",
        username: "hinocag",
        goal: "engagement",
        status: "completed",
        budget: 5000,
        startDate: "2026-03-08T23:12:00.000Z",
        endDate: "2026-03-23T23:12:00.000Z"
      },
      {
        campaignId: "9",
        username: "Hormo2urs",
        goal: "awareness",
        status: "paused",
        budget: 1000,
        startDate: null,
        endDate: null
      }
    ],
    total: 2
  });
});

test("listAdminCampaigns applies filters and rejects invalid filter values", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  await listAdminCampaigns(
    {
      status: "paused",
      username: " seller-one ",
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

  expect(executedQueries[0]?.text).toContain(
    "LOWER(COALESCE(ppc.status::text, '')) = ANY($1::text[])"
  );
  expect(executedQueries[0]?.text).toContain("LOWER(BTRIM(u.username)) = LOWER($2)");
  expect(executedQueries[0]?.params).toEqual([["paused", "cancelled"], "seller-one", 50, 50]);

  await expect(
    listAdminCampaigns({
      page: 0,
      limit: 20
    })
  ).rejects.toThrow(AdminCampaignsValidationError);

  await expect(
    listAdminCampaigns({
      page: 1,
      limit: 0
    })
  ).rejects.toThrow(AdminCampaignsValidationError);

  await expect(
    listAdminCampaigns({
      status: "unknown" as never,
      page: 1,
      limit: 20
    })
  ).rejects.toThrow(
    "status must be one of draft, pending_approval, active, paused, completed, rejected"
  );

  await expect(
    listAdminCampaigns({
      username: "   ",
      page: 1,
      limit: 20
    })
  ).rejects.toThrow("username must be a non-empty string when provided");
});

test("GET /admin/campaigns returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/campaigns returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listAdminCampaignsHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/campaigns validates query filters", async () => {
  const application = express();

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminCampaignsHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/campaigns?status=unknown`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "status must be one of draft, pending_approval, active, paused, completed, rejected"
    });

    response = await fetch(`${server.baseUrl}/admin/campaigns?username=%20%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "username must be a non-empty string when provided"
    });

    response = await fetch(`${server.baseUrl}/admin/campaigns?page=abc`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "page must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/campaigns?limit=0`, {
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
});

test("GET /admin/campaigns returns the paginated campaigns payload and passes trimmed filters", async () => {
  const application = express();

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminCampaignsHandler: async (
        filters
      ): Promise<AdminCampaignsListResponse> => {
        expect(filters).toEqual({
          status: "paused",
          username: "seller-one",
          page: 2,
          limit: 100
        });

        return {
          campaigns: [
            {
              campaignId: "13",
              username: "seller-one",
              goal: "engagement",
              status: "completed",
              budget: 5000,
              startDate: "2026-03-08T23:12:00.000Z",
              endDate: "2026-03-23T23:12:00.000Z"
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
      `${server.baseUrl}/admin/campaigns?status=paused&username=%20seller-one%20&page=2&limit=250`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      campaigns: [
        {
          campaignId: "13",
          username: "seller-one",
          goal: "engagement",
          status: "completed",
          budget: 5000,
          startDate: "2026-03-08T23:12:00.000Z",
          endDate: "2026-03-23T23:12:00.000Z"
        }
      ],
      total: 1
    });
  } finally {
    await server.close();
  }
});
