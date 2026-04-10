import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminSupportRouter } from "../../src/modules/admin-support/routes";
import {
  AdminSupportTicketsValidationError,
  listAdminSupportTickets
} from "../../src/modules/admin-support/service";
import { AdminSupportTicketsListResponse } from "../../src/modules/admin-support/types";

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

test("listAdminSupportTickets maps support ticket rows, applies filters, and falls back to owner usernames", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listAdminSupportTickets(
    {
      status: "pending",
      username: " Hormo2urz1 ",
      categoryId: 3,
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
              total: 2
            }
          ]) as unknown as QueryResult<T>;
        }

        return createQueryResult([
          {
            id: 7,
            username: "Hormo2urz1",
            subject: "Payment not processed",
            status: 2,
            createdAt: new Date("2026-03-08T23:12:00.000Z")
          },
          {
            id: 5,
            username: "owner-fallback",
            subject: "Need help with refund",
            status: 3,
            createdAt: new Date("2026-03-07T12:00:00.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("FROM public.support_ticket st");
  expect(executedQueries[0]?.text).toContain('LEFT JOIN public."user" u ON u.id = st."userId"');
  expect(executedQueries[0]?.text).toContain("COALESCE(st.status, 1) = $1");
  expect(executedQueries[0]?.text).toContain('st."ticketCategoryId" = $3');
  expect(executedQueries[0]?.text).toContain('ORDER BY st."createdAt" DESC, st.id DESC');
  expect(executedQueries[0]?.params).toEqual([2, "Hormo2urz1", 3, 50, 50]);
  expect(response).toEqual({
    tickets: [
      {
        id: 7,
        username: "Hormo2urz1",
        subject: "Payment not processed",
        status: "pending",
        createdAt: "2026-03-08T23:12:00.000Z"
      },
      {
        id: 5,
        username: "owner-fallback",
        subject: "Need help with refund",
        status: "closed",
        createdAt: "2026-03-07T12:00:00.000Z"
      }
    ],
    total: 2
  });
});

test("listAdminSupportTickets validates filters and returns an empty list when nothing matches", async () => {
  await expect(
    listAdminSupportTickets({
      status: "unknown" as never,
      page: 1,
      limit: 20
    })
  ).rejects.toThrow("status must be one of open, closed, pending");

  await expect(
    listAdminSupportTickets({
      username: "   ",
      page: 1,
      limit: 20
    })
  ).rejects.toThrow("username must be a non-empty string when provided");

  await expect(
    listAdminSupportTickets({
      categoryId: 0,
      page: 1,
      limit: 20
    })
  ).rejects.toThrow(AdminSupportTicketsValidationError);

  await expect(
    listAdminSupportTickets({
      page: 0,
      limit: 20
    })
  ).rejects.toThrow(AdminSupportTicketsValidationError);

  await expect(
    listAdminSupportTickets({
      page: 1,
      limit: 0
    })
  ).rejects.toThrow(AdminSupportTicketsValidationError);

  const response = await listAdminSupportTickets(
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
              total: 0
            }
          ]) as unknown as QueryResult<T>;
        }

        return createQueryResult([]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(response).toEqual({
    tickets: [],
    total: 0
  });
});

test("GET /admin/support/tickets returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/support/tickets`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/support/tickets returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listAdminSupportTicketsHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/support/tickets`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/support/tickets validates query filters", async () => {
  const application = express();

  application.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminSupportTicketsHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/support/tickets?status=bad`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "status must be one of open, closed, pending"
    });

    response = await fetch(`${server.baseUrl}/admin/support/tickets?username=%20%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "username must be a non-empty string when provided"
    });

    response = await fetch(`${server.baseUrl}/admin/support/tickets?categoryId=abc`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "categoryId must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/support/tickets?page=0`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "page must be a positive integer"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/support/tickets returns the tickets payload and passes trimmed filters", async () => {
  const application = express();

  application.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminSupportTicketsHandler: async (
        filters
      ): Promise<AdminSupportTicketsListResponse> => {
        expect(filters).toEqual({
          status: "open",
          username: "mendes",
          categoryId: 3,
          page: 2,
          limit: 100
        });

        return {
          tickets: [
            {
              id: 3,
              username: "mendes",
              subject: "Payment not processed",
              status: "open",
              createdAt: "2025-10-30T15:00:23.000Z"
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
      `${server.baseUrl}/admin/support/tickets?status=open&username=%20mendes%20&categoryId=3&page=2&limit=250`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      tickets: [
        {
          id: 3,
          username: "mendes",
          subject: "Payment not processed",
          status: "open",
          createdAt: "2025-10-30T15:00:23.000Z"
        }
      ],
      total: 1
    });
  } finally {
    await server.close();
  }
});
