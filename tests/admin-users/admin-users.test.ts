import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminUsersRouter } from "../../src/modules/admin-users/routes";
import { listPlatformUsers } from "../../src/modules/admin-users/service";

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

test("listPlatformUsers uses the default pagination, excludes null user types, and maps public user fields", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listPlatformUsers(
    {
      page: 1,
      limit: 20
    },
    {
      queryFn: async <T extends QueryResultRow>(text: string, params?: unknown[]) => {
        executedQueries.push({ text, params });

        if (text.includes("COUNT(*)::int AS total")) {
          return createQueryResult([{ total: 2 }]) as unknown as QueryResult<T>;
        }

        return createQueryResult([
          {
            username: "buyer-1",
            firstName: "Jane",
            lastName: "Doe",
            emailAddress: "jane.doe@example.com",
            phoneNumber: "+2348012345678",
            userTypeId: 1,
            status: 1,
            createdAt: new Date("2026-04-07T11:00:00.000Z")
          },
          {
            username: "logistics-1",
            firstName: "John",
            lastName: "Rider",
            emailAddress: "john.rider@example.com",
            phoneNumber: "",
            userTypeId: 3,
            status: 2,
            createdAt: new Date("2026-04-06T09:30:00.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain('FROM public."user" u');
  expect(executedQueries[0]?.text).toContain('u."userTypeId" IN (1, 2, 3)');
  expect(executedQueries[0]?.text).toContain('ORDER BY u."createdAt" DESC');
  expect(executedQueries[0]?.text).toContain("LIMIT $1");
  expect(executedQueries[0]?.text).toContain("OFFSET $2");
  expect(executedQueries[0]?.text).not.toContain("user_auth");
  expect(executedQueries[0]?.params).toEqual([20, 0]);
  expect(executedQueries[1]?.params).toEqual([]);
  expect(response).toEqual({
    users: [
      {
        username: "buyer-1",
        firstName: "Jane",
        lastName: "Doe",
        emailAddress: "jane.doe@example.com",
        phoneNumber: "+2348012345678",
        userTypeId: 1,
        status: 1,
        createdAt: "2026-04-07T11:00:00.000Z"
      },
      {
        username: "logistics-1",
        firstName: "John",
        lastName: "Rider",
        emailAddress: "john.rider@example.com",
        phoneNumber: "",
        userTypeId: 3,
        status: 2,
        createdAt: "2026-04-06T09:30:00.000Z"
      }
    ],
    total: 2
  });
});

test("listPlatformUsers applies role, status, date, and pagination filters consistently to rows and total count", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  const from = new Date("2026-04-01T00:00:00.000Z");
  const to = new Date("2026-04-30T23:59:59.000Z");

  await listPlatformUsers(
    {
      userTypeId: 2,
      status: 1,
      page: 2,
      limit: 10,
      from,
      to
    },
    {
      queryFn: async <T extends QueryResultRow>(text: string, params?: unknown[]) => {
        executedQueries.push({ text, params });

        if (text.includes("COUNT(*)::int AS total")) {
          return createQueryResult([{ total: 1 }]) as unknown as QueryResult<T>;
        }

        return createQueryResult([]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain('u."userTypeId" = $1');
  expect(executedQueries[0]?.text).toContain("u.status = $2");
  expect(executedQueries[0]?.text).toContain('u."createdAt" >= $3');
  expect(executedQueries[0]?.text).toContain('u."createdAt" <= $4');
  expect(executedQueries[0]?.params).toEqual([2, 1, from, to, 10, 10]);
  expect(executedQueries[1]?.params).toEqual([2, 1, from, to]);
});

test("GET /admin/users returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/users returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listPlatformUsersHandler: async () => ({
        users: [],
        total: 0
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/users validates query parameters", async () => {
  const application = express();

  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listPlatformUsersHandler: async () => ({
        users: [],
        total: 0
      })
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/users?userTypeId=4`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/users?status=3`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/users?page=0`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/users?limit=abc`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/users?from=not-a-date`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/users?to=not-a-date`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);

    response = await fetch(
      `${server.baseUrl}/admin/users?from=2026-04-10T00:00:00.000Z&to=2026-04-01T00:00:00.000Z`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );
    expect(response.status).toBe(400);
  } finally {
    await server.close();
  }
});

test("GET /admin/users parses filters, caps limit, and returns paginated users", async () => {
  const application = express();

  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listPlatformUsersHandler: async (filters) => {
        expect(filters.userTypeId).toBe(2);
        expect(filters.status).toBe(1);
        expect(filters.page).toBe(2);
        expect(filters.limit).toBe(100);
        expect(filters.from?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
        expect(filters.to?.toISOString()).toBe("2026-04-30T23:59:59.000Z");

        return {
          users: [
            {
              username: "seller-1",
              firstName: "Ada",
              lastName: "Store",
              emailAddress: "ada.store@example.com",
              phoneNumber: "+2348099999999",
              userTypeId: 2,
              status: 1,
              createdAt: "2026-04-07T11:00:00.000Z"
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
      `${server.baseUrl}/admin/users?userTypeId=2&status=1&page=2&limit=200&from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.000Z`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      users: Array<Record<string, unknown>>;
      total: number;
    };

    expect(payload.total).toBe(1);
    expect(payload.users).toHaveLength(1);
    expect(payload.users[0]?.userTypeId).toBe(2);
    expect(payload.users[0]?.status).toBe(1);
    expect(payload.users[0]?.emailAddress).toBe("ada.store@example.com");
  } finally {
    await server.close();
  }
});
