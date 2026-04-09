import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminCampaignsRouter } from "../../src/modules/admin-campaigns/routes";
import {
  AdminCampaignApprovalConflictError,
  getAdminCampaignAnalytics,
  AdminCampaignNotFoundError,
  AdminCampaignPauseConflictError,
  AdminCampaignRejectionConflictError,
  AdminCampaignsValidationError,
  approveAdminCampaign,
  getAdminCampaignDetails,
  listAdminCampaigns,
  pauseAdminCampaign,
  rejectAdminCampaign
} from "../../src/modules/admin-campaigns/service";
import {
  AdminCampaignAnalyticsResponse,
  AdminCampaignDetailsResponse,
  AdminCampaignsListResponse,
  PauseAdminCampaignResponse,
  RejectAdminCampaignResponse
} from "../../src/modules/admin-campaigns/types";

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

test("getAdminCampaignAnalytics aggregates platform metrics and derives ctr from filtered activity", async () => {
  const from = new Date("2026-03-01T00:00:00.000Z");
  const to = new Date("2026-03-31T23:59:59.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getAdminCampaignAnalytics(
    {
      from,
      to
    },
    {
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        executedQueries.push({ text, params });

        return createQueryResult([
          {
            totalCampaigns: "5",
            totalImpressions: "200",
            totalClicks: 25,
            totalConversions: "6",
            totalRevenue: "14500.50"
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(1);
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_campaign ppc");
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_impression ppi");
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_click ppclick");
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_engagement ppe");
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_transaction ppt");
  expect(executedQueries[0]?.params).toEqual([from, to]);
  expect(response).toEqual({
    totalCampaigns: 5,
    totalImpressions: 200,
    totalClicks: 25,
    totalConversions: 6,
    totalRevenue: 14500.5,
    ctr: 12.5
  });
});

test("getAdminCampaignAnalytics validates date filters and handles empty metric rows", async () => {
  const response = await getAdminCampaignAnalytics(
    {},
    {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([
          {
            totalCampaigns: 0,
            totalImpressions: 0,
            totalClicks: 0,
            totalConversions: 0,
            totalRevenue: 0
          }
        ]) as unknown as QueryResult<T>
    }
  );

  expect(response).toEqual({
    totalCampaigns: 0,
    totalImpressions: 0,
    totalClicks: 0,
    totalConversions: 0,
    totalRevenue: 0,
    ctr: 0
  });

  await expect(
    getAdminCampaignAnalytics({
      from: new Date("invalid")
    })
  ).rejects.toThrow("from must be a valid ISO 8601 datetime");

  await expect(
    getAdminCampaignAnalytics({
      to: new Date("invalid")
    })
  ).rejects.toThrow("to must be a valid ISO 8601 datetime");

  await expect(
    getAdminCampaignAnalytics({
      from: new Date("2026-04-01T00:00:00.000Z"),
      to: new Date("2026-03-01T00:00:00.000Z")
    })
  ).rejects.toThrow("from must be less than or equal to to");
});

test("approveAdminCampaign activates a draft campaign and preserves an existing start date", async () => {
  const fixedNow = new Date("2026-04-09T19:30:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await approveAdminCampaign(
    13,
    {
      note: " Manual review passed "
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
              id: 13,
              status: "draft"
            }
          ]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 2) {
          return createQueryResult([
            {
              id: 13
            }
          ]) as unknown as QueryResult<T>;
        }

        throw new Error(`Unexpected query: ${text}`);
      }
    }
  );

  expect(response).toEqual({
    message: "Campaign approved and is now active"
  });
  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_campaign ppc");
  expect(executedQueries[0]?.params).toEqual([13]);
  expect(executedQueries[1]?.text).toContain("UPDATE public.promote_post_campaign");
  expect(executedQueries[1]?.text).toContain('"startDate" = COALESCE("startDate", $2)');
  expect(executedQueries[1]?.params).toEqual(["active", fixedNow, fixedNow, 13]);
});

test("approveAdminCampaign validates inputs and maps missing or invalid campaign states", async () => {
  await expect(approveAdminCampaign(0, {})).rejects.toThrow(AdminCampaignsValidationError);

  await expect(
    approveAdminCampaign(13, {
      note: "   "
    })
  ).rejects.toThrow("note must be a non-empty string when provided");

  await expect(
    approveAdminCampaign(404, {}, {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(AdminCampaignNotFoundError);

  await expect(
    approveAdminCampaign(13, {}, {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([
          {
            id: 13,
            status: "active"
          }
        ]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow("Campaign is already active");

  await expect(
    approveAdminCampaign(13, {}, {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([
          {
            id: 13,
            status: "pending_payment"
          }
        ]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow("Campaign is awaiting payment and cannot be approved");

  await expect(
    approveAdminCampaign(13, {}, {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([
          {
            id: 13,
            status: "completed"
          }
        ]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow("Campaign cannot be approved from its current status");

  await expect(
    approveAdminCampaign(
      13,
      {},
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> => {
          if (text.includes("FROM public.promote_post_campaign ppc")) {
            return createQueryResult([
              {
                id: 13,
                status: "draft"
              }
            ]) as unknown as QueryResult<T>;
          }

          if (text.includes("UPDATE public.promote_post_campaign")) {
            return createQueryResult([]) as unknown as QueryResult<T>;
          }

          throw new Error(`Unexpected query: ${text}`);
        }
      }
    )
  ).rejects.toThrow("Campaign approval update did not return a row");
});

test("rejectAdminCampaign rejects a pre-live campaign and writes an audit log", async () => {
  const fixedNow = new Date("2026-04-09T20:00:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await rejectAdminCampaign(
    13,
    {
      reason: " Budget claim does not match policy ",
      actedByAdminUserId: "admin-user-id"
    },
    {
      nowFactory: () => fixedNow,
      uuidFactory: () => "campaign-rejection-audit-id",
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
                  id: 13,
                  userId: 127,
                  status: "draft"
                }
              ]) as unknown as QueryResult<T>;
            }

            if (executedQueries.length === 2) {
              return createQueryResult([
                {
                  id: 13
                }
              ]) as unknown as QueryResult<T>;
            }

            if (executedQueries.length === 3) {
              return createQueryResult([]) as unknown as QueryResult<T>;
            }

            throw new Error(`Unexpected query: ${text}`);
          }
        })
    }
  );

  expect(response).toEqual({
    message: "Campaign rejected"
  });
  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_campaign ppc");
  expect(executedQueries[0]?.text).toContain("FOR UPDATE");
  expect(executedQueries[0]?.params).toEqual([13]);
  expect(executedQueries[1]?.text).toContain("UPDATE public.promote_post_campaign");
  expect(executedQueries[1]?.params).toEqual(["rejected", fixedNow, 13]);
  expect(executedQueries[2]?.text).toContain("INSERT INTO public.admin_campaign_rejection_audit_logs");
  expect(executedQueries[2]?.params).toEqual([
    "campaign-rejection-audit-id",
    13,
    127,
    "admin-user-id",
    "Budget claim does not match policy",
    "draft",
    "rejected",
    fixedNow
  ]);
});

test("rejectAdminCampaign validates inputs and maps missing or invalid campaign states", async () => {
  await expect(
    rejectAdminCampaign(0, {
      reason: "Reason",
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow(AdminCampaignsValidationError);

  await expect(
    rejectAdminCampaign(13, {
      reason: "   ",
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow("reason is required and must be a non-empty string");

  await expect(
    rejectAdminCampaign(13, {
      reason: "Reason",
      actedByAdminUserId: "   "
    })
  ).rejects.toThrow("actedByAdminUserId is required");

  await expect(
    rejectAdminCampaign(
      404,
      {
        reason: "Reason",
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
  ).rejects.toThrow(AdminCampaignNotFoundError);

  await expect(
    rejectAdminCampaign(
      13,
      {
        reason: "Reason",
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation({
            query: async <T extends QueryResultRow = QueryResultRow>() =>
              createQueryResult([
                {
                  id: 13,
                  userId: 127,
                  status: "rejected"
                }
              ]) as unknown as QueryResult<T>
          })
      }
    )
  ).rejects.toThrow("Campaign is already rejected");

  await expect(
    rejectAdminCampaign(
      13,
      {
        reason: "Reason",
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation({
            query: async <T extends QueryResultRow = QueryResultRow>() =>
              createQueryResult([
                {
                  id: 13,
                  userId: 127,
                  status: "active"
                }
              ]) as unknown as QueryResult<T>
          })
      }
    )
  ).rejects.toThrow("Campaign cannot be rejected from its current status");

  await expect(
    rejectAdminCampaign(
      13,
      {
        reason: "Reason",
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation({
            query: async <T extends QueryResultRow = QueryResultRow>(
              text: string
            ): Promise<QueryResult<T>> => {
              if (text.includes("FROM public.promote_post_campaign ppc")) {
                return createQueryResult([
                  {
                    id: 13,
                    userId: 127,
                    status: "draft"
                  }
                ]) as unknown as QueryResult<T>;
              }

              if (text.includes("UPDATE public.promote_post_campaign")) {
                return createQueryResult([]) as unknown as QueryResult<T>;
              }

              throw new Error(`Unexpected query: ${text}`);
            }
          })
      }
    )
  ).rejects.toThrow("Campaign rejection update did not return a row");
});

test("pauseAdminCampaign pauses an active campaign", async () => {
  const fixedNow = new Date("2026-04-09T20:30:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await pauseAdminCampaign(
    13,
    {
      reason: " Policy review in progress "
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
              id: 13,
              status: "active"
            }
          ]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 2) {
          return createQueryResult([
            {
              id: 13
            }
          ]) as unknown as QueryResult<T>;
        }

        throw new Error(`Unexpected query: ${text}`);
      }
    }
  );

  expect(response).toEqual({
    message: "Campaign paused"
  });
  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_campaign ppc");
  expect(executedQueries[0]?.params).toEqual([13]);
  expect(executedQueries[1]?.text).toContain("UPDATE public.promote_post_campaign");
  expect(executedQueries[1]?.params).toEqual(["paused", fixedNow, 13]);
});

test("pauseAdminCampaign validates inputs and maps missing or invalid campaign states", async () => {
  await expect(pauseAdminCampaign(0, {})).rejects.toThrow(AdminCampaignsValidationError);

  await expect(
    pauseAdminCampaign(13, {
      reason: "   "
    })
  ).rejects.toThrow("reason must be a non-empty string when provided");

  await expect(
    pauseAdminCampaign(404, {}, {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(AdminCampaignNotFoundError);

  await expect(
    pauseAdminCampaign(13, {}, {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([
          {
            id: 13,
            status: "paused"
          }
        ]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow("Campaign is already paused");

  await expect(
    pauseAdminCampaign(13, {}, {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([
          {
            id: 13,
            status: "draft"
          }
        ]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow("Campaign cannot be paused from its current status");

  await expect(
    pauseAdminCampaign(
      13,
      {},
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> => {
          if (text.includes("FROM public.promote_post_campaign ppc")) {
            return createQueryResult([
              {
                id: 13,
                status: "active"
              }
            ]) as unknown as QueryResult<T>;
          }

          if (text.includes("UPDATE public.promote_post_campaign")) {
            return createQueryResult([]) as unknown as QueryResult<T>;
          }

          throw new Error(`Unexpected query: ${text}`);
        }
      }
    )
  ).rejects.toThrow("Campaign pause update did not return a row");
});

test("getAdminCampaignDetails maps campaign metrics with stored-stat fallbacks", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getAdminCampaignDetails(13, {
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      executedQueries.push({ text, params });

      return createQueryResult([
        {
          id: 13,
          postId: 91,
          username: "hinocag",
          goal: "increase_website_visits",
          status: "cancelled",
          budget: "5000.00",
          impressions: "18",
          clicks: 3,
          conversions: "2",
          createdAt: new Date("2026-03-08T23:11:59.000Z")
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(executedQueries).toHaveLength(1);
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_campaign ppc");
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_campaign_stats ppcs");
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_impression ppi");
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_click ppclick");
  expect(executedQueries[0]?.text).toContain("FROM public.promote_post_engagement ppe");
  expect(executedQueries[0]?.params).toEqual([13]);
  expect(response).toEqual({
    campaignId: "13",
    username: "hinocag",
    goal: "conversion",
    status: "paused",
    budget: 5000,
    impressions: 18,
    clicks: 3,
    conversions: 2,
    postId: "91",
    createdAt: "2026-03-08T23:11:59.000Z"
  });
});

test("getAdminCampaignDetails validates the id and maps missing campaigns", async () => {
  await expect(getAdminCampaignDetails(0)).rejects.toThrow(AdminCampaignsValidationError);

  await expect(
    getAdminCampaignDetails(404, {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(AdminCampaignNotFoundError);
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

test("PUT /admin/campaigns/:campaignId/approve returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());

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
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/approve`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        note: "Manual review passed"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/approve returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      approveAdminCampaignHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        note: "Manual review passed"
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/approve validates the campaign identifier and optional note", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveAdminCampaignHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/campaigns/abc/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "campaignId must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/campaigns/13/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        note: "   "
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "note must be a non-empty string when provided"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/approve maps 404 and 409 errors", async () => {
  let server;
  const notFoundApplication = express();
  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveAdminCampaignHandler: async () => {
        throw new AdminCampaignNotFoundError("Campaign not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Campaign not found"
    });
  } finally {
    await server.close();
  }

  const conflictApplication = express();
  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveAdminCampaignHandler: async () => {
        throw new AdminCampaignApprovalConflictError("Campaign is already active");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(409);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Campaign is already active"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/reject returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());

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
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/reject`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Budget claim does not match policy"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/reject returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      rejectAdminCampaignHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Budget claim does not match policy"
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/reject validates the campaign identifier and required reason", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      rejectAdminCampaignHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/campaigns/abc/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "campaignId must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/campaigns/13/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "   "
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "reason is required and must be a non-empty string"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/reject maps 404 and 409 errors", async () => {
  let server;
  const notFoundApplication = express();
  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      rejectAdminCampaignHandler: async () => {
        throw new AdminCampaignNotFoundError("Campaign not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Budget claim does not match policy"
      })
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Campaign not found"
    });
  } finally {
    await server.close();
  }

  const conflictApplication = express();
  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      rejectAdminCampaignHandler: async () => {
        throw new AdminCampaignRejectionConflictError("Campaign is already rejected");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Budget claim does not match policy"
      })
    });

    expect(response.status).toBe(409);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Campaign is already rejected"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/pause returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());

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
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/pause`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Policy review in progress"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/pause returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      pauseAdminCampaignHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/pause`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Policy review in progress"
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/pause validates the campaign identifier and optional reason", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      pauseAdminCampaignHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/campaigns/abc/pause`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "campaignId must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/campaigns/13/pause`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "   "
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "reason must be a non-empty string when provided"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/pause maps 404 and 409 errors", async () => {
  let server;
  const notFoundApplication = express();
  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      pauseAdminCampaignHandler: async () => {
        throw new AdminCampaignNotFoundError("Campaign not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/pause`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Campaign not found"
    });
  } finally {
    await server.close();
  }

  const conflictApplication = express();
  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      pauseAdminCampaignHandler: async () => {
        throw new AdminCampaignPauseConflictError("Campaign is already paused");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13/pause`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(409);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Campaign is already paused"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/campaigns/:campaignId returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/campaigns/:campaignId returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      getAdminCampaignDetailsHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/campaigns/:campaignId validates the campaign identifier", async () => {
  const application = express();

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getAdminCampaignDetailsHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/abc`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "campaignId must be a positive integer"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/campaigns/:campaignId maps not found errors", async () => {
  const application = express();

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getAdminCampaignDetailsHandler: async () => {
        throw new AdminCampaignNotFoundError("Campaign not found");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/13`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Campaign not found"
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

test("GET /admin/campaigns/analytics returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/campaigns/analytics`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/campaigns/analytics returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      getAdminCampaignAnalyticsHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/analytics`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/campaigns/analytics validates date query filters and maps service validation errors", async () => {
  let server;
  const validationApplication = express();

  validationApplication.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getAdminCampaignAnalyticsHandler: async () => {
        throw new AdminCampaignsValidationError("from must be less than or equal to to");
      }
    })
  );

  server = await startTestServer(validationApplication);

  try {
    let response = await fetch(`${server.baseUrl}/admin/campaigns/analytics?from=bad-date`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "from must be a valid ISO 8601 datetime"
    });

    response = await fetch(
      `${server.baseUrl}/admin/campaigns/analytics?from=2026-04-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z`,
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

    response = await fetch(`${server.baseUrl}/admin/campaigns/analytics`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "from must be less than or equal to to"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/campaigns/analytics returns the aggregate analytics payload and passes parsed dates", async () => {
  const application = express();

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getAdminCampaignAnalyticsHandler: async (
        filters
      ): Promise<AdminCampaignAnalyticsResponse> => {
        expect(filters).toEqual({
          from: new Date("2026-03-01T00:00:00.000Z"),
          to: new Date("2026-03-31T23:59:59.000Z")
        });

        return {
          totalCampaigns: 5,
          totalImpressions: 200,
          totalClicks: 25,
          totalConversions: 6,
          totalRevenue: 14500.5,
          ctr: 12.5
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/campaigns/analytics?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.000Z`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      totalCampaigns: 5,
      totalImpressions: 200,
      totalClicks: 25,
      totalConversions: 6,
      totalRevenue: 14500.5,
      ctr: 12.5
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/campaigns/:campaignId returns the campaign details payload", async () => {
  const application = express();

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getAdminCampaignDetailsHandler: async (
        campaignId
      ): Promise<AdminCampaignDetailsResponse> => {
        expect(campaignId).toBe(13);

        return {
          campaignId: "13",
          username: "hinocag",
          goal: "engagement",
          status: "completed",
          budget: 5000,
          impressions: 18,
          clicks: 3,
          conversions: 2,
          postId: "91",
          createdAt: "2026-03-08T23:11:59.000Z"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/%2013%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      campaignId: "13",
      username: "hinocag",
      goal: "engagement",
      status: "completed",
      budget: 5000,
      impressions: 18,
      clicks: 3,
      conversions: 2,
      postId: "91",
      createdAt: "2026-03-08T23:11:59.000Z"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/approve returns the success payload and passes trimmed values", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      approveAdminCampaignHandler: async (
        campaignId,
        payload
      ) => {
        expect(campaignId).toBe(13);
        expect(payload).toEqual({
          note: "Manual review passed"
        });

        return {
          message: "Campaign approved and is now active"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/%2013%20/approve`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        note: " Manual review passed "
      })
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Campaign approved and is now active"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/reject returns the success payload and passes trimmed values", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      rejectAdminCampaignHandler: async (
        campaignId,
        payload
      ): Promise<RejectAdminCampaignResponse> => {
        expect(campaignId).toBe(13);
        expect(payload).toEqual({
          reason: "Budget claim does not match policy",
          actedByAdminUserId: "admin-user-id"
        });

        return {
          message: "Campaign rejected"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/%2013%20/reject`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: " Budget claim does not match policy "
      })
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Campaign rejected"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/campaigns/:campaignId/pause returns the success payload and passes trimmed values", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/campaigns",
    createAdminCampaignsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      pauseAdminCampaignHandler: async (
        campaignId,
        payload
      ): Promise<PauseAdminCampaignResponse> => {
        expect(campaignId).toBe(13);
        expect(payload).toEqual({
          reason: "Policy review in progress"
        });

        return {
          message: "Campaign paused"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/campaigns/%2013%20/pause`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: " Policy review in progress "
      })
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Campaign paused"
    });
  } finally {
    await server.close();
  }
});
