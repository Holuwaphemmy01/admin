import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminAccountsRouter } from "../../src/modules/admin-accounts/routes";
import {
  AdminAccountConflictError,
  AdminAccountNotFoundError,
  listAdminAccounts,
  revokeAdminAccess
} from "../../src/modules/admin-accounts/service";

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

test("listAdminAccounts reads from admin_users only and maps response-safe admin summaries", async () => {
  const executedQueries: string[] = [];

  const response = await listAdminAccounts({
    queryFn: async <T extends QueryResultRow>(text: string) => {
      executedQueries.push(text);

      return createQueryResult([
        {
          id: "second-admin-id",
          username: null,
          emailAddress: "support-admin@brickpine.local",
          role: "support",
          status: "active",
          createdAt: new Date("2026-04-07T11:00:00.000Z")
        },
        {
          id: "first-admin-id",
          username: "finance-admin",
          emailAddress: "finance-admin@brickpine.local",
          role: "finance",
          status: "invited",
          createdAt: new Date("2026-04-06T09:30:00.000Z")
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(executedQueries).toHaveLength(1);
  expect(executedQueries[0]).toContain("FROM public.admin_users");
  expect(executedQueries[0]).toContain('ORDER BY au."createdAt" DESC');
  expect(executedQueries[0]).not.toContain("admin_credentials");
  expect(response).toEqual({
    admins: [
      {
        id: "second-admin-id",
        username: "support-admin@brickpine.local",
        role: "support",
        status: "active",
        createdAt: "2026-04-07T11:00:00.000Z"
      },
      {
        id: "first-admin-id",
        username: "finance-admin",
        role: "finance",
        status: "invited",
        createdAt: "2026-04-06T09:30:00.000Z"
      }
    ]
  });
});

test("revokeAdminAccess updates admin status to revoked and writes an audit log", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await revokeAdminAccess(
    {
      targetAdminId: "11111111-2222-3333-4444-555555555555",
      reason: "  Repeated policy violations  ",
      revokedByAdmin: createAuthenticatedAdmin({
        sub: "99999999-8888-7777-6666-555555555555"
      })
    },
    {
      uuidFactory: () => "audit-log-id",
      nowFactory: () => new Date("2026-04-07T12:30:00.000Z"),
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            executedQueries.push({ text, params });

            if (text.includes("WHERE au.id = $1") && text.includes("FOR UPDATE")) {
              return createQueryResult([
                {
                  id: "11111111-2222-3333-4444-555555555555",
                  role: "support",
                  status: "suspended"
                }
              ]);
            }

            return createQueryResult([]);
          })
        )
    }
  );

  expect(response).toEqual({
    message: "Admin access revoked"
  });
  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[0]?.text).toContain("FROM public.admin_users au");
  expect(executedQueries[1]?.text).toContain("UPDATE public.admin_users");
  expect(executedQueries[1]?.params).toEqual([
    "revoked",
    new Date("2026-04-07T12:30:00.000Z"),
    "11111111-2222-3333-4444-555555555555"
  ]);
  expect(executedQueries[2]?.text).toContain("INSERT INTO public.admin_access_audit_logs");
  expect(executedQueries[2]?.params).toEqual([
    "audit-log-id",
    "11111111-2222-3333-4444-555555555555",
    "99999999-8888-7777-6666-555555555555",
    "revoke_access",
    "suspended",
    "revoked",
    "Repeated policy violations",
    new Date("2026-04-07T12:30:00.000Z")
  ]);
});

test("revokeAdminAccess rejects invalid ids, missing admins, revoked admins, self-revokes, and the last active super admin", async () => {
  await expect(
    revokeAdminAccess({
      targetAdminId: "not-a-uuid",
      revokedByAdmin: createAuthenticatedAdmin()
    })
  ).rejects.toThrow("id must be a valid UUID");

  await expect(
    revokeAdminAccess(
      {
        targetAdminId: "11111111-2222-3333-4444-555555555555",
        revokedByAdmin: createAuthenticatedAdmin()
      },
      {
        runInTransaction: async (operation) =>
          operation(createTransactionClient(async () => createQueryResult([])))
      }
    )
  ).rejects.toThrow("Admin account not found");

  await expect(
    revokeAdminAccess(
      {
        targetAdminId: "11111111-2222-3333-4444-555555555555",
        revokedByAdmin: createAuthenticatedAdmin()
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("WHERE au.id = $1") && text.includes("FOR UPDATE")) {
                return createQueryResult([
                  {
                    id: "11111111-2222-3333-4444-555555555555",
                    role: "support",
                    status: "revoked"
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("Admin access has already been revoked");

  await expect(
    revokeAdminAccess(
      {
        targetAdminId: "11111111-2222-3333-4444-555555555555",
        revokedByAdmin: createAuthenticatedAdmin({
          sub: "11111111-2222-3333-4444-555555555555"
        })
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("WHERE au.id = $1") && text.includes("FOR UPDATE")) {
                return createQueryResult([
                  {
                    id: "11111111-2222-3333-4444-555555555555",
                    role: "support",
                    status: "active"
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("You cannot revoke your own admin access");

  await expect(
    revokeAdminAccess(
      {
        targetAdminId: "11111111-2222-3333-4444-555555555555",
        revokedByAdmin: createAuthenticatedAdmin({
          sub: "99999999-8888-7777-6666-555555555555"
        })
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("WHERE au.id = $1") && text.includes("FOR UPDATE")) {
                return createQueryResult([
                  {
                    id: "11111111-2222-3333-4444-555555555555",
                    role: "super_admin",
                    status: "active"
                  }
                ]);
              }

              if (text.includes("WHERE role = $1 AND status = $2")) {
                return createQueryResult([
                  {
                    id: "11111111-2222-3333-4444-555555555555"
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("Cannot revoke the last active super admin");
});

test("GET /admin/auth/admins returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/admins`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/auth/admins returns 403 for non-super-admins and 200 for super admins", async () => {
  const forbiddenApplication = express();

  forbiddenApplication.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listAdminAccountsHandler: async () => ({
        admins: []
      })
    })
  );

  let server = await startTestServer(forbiddenApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/admins`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }

  const successApplication = express();

  successApplication.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listAdminAccountsHandler: async () => ({
        admins: [
          {
            id: "second-admin-id",
            username: "support-admin@brickpine.local",
            role: "support",
            status: "active",
            createdAt: "2026-04-07T11:00:00.000Z"
          },
          {
            id: "first-admin-id",
            username: "finance-admin",
            role: "finance",
            status: "invited",
            createdAt: "2026-04-06T09:30:00.000Z"
          }
        ]
      })
    })
  );

  server = await startTestServer(successApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/admins`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      admins: Array<Record<string, unknown>>;
    };

    expect(payload.admins).toHaveLength(2);
    expect(Object.keys(payload.admins[0] ?? {})).toEqual([
      "id",
      "username",
      "role",
      "status",
      "createdAt"
    ]);
    expect(payload.admins[0]?.username).toBe("support-admin@brickpine.local");
    expect(payload.admins[1]?.role).toBe("finance");
  } finally {
    await server.close();
  }
});

test("PUT /admin/auth/admins/:id/revoke returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/auth/admins/11111111-2222-3333-4444-555555555555/revoke`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reason: "Repeated policy violations"
        })
      }
    );

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/auth/admins/:id/revoke enforces role checks and validates inputs", async () => {
  const forbiddenApplication = express();

  forbiddenApplication.use(express.json());
  forbiddenApplication.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      revokeAdminAccessHandler: async () => ({
        message: "Admin access revoked"
      })
    })
  );

  let server = await startTestServer(forbiddenApplication);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/auth/admins/11111111-2222-3333-4444-555555555555/revoke`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer any-token"
        },
        body: JSON.stringify({
          reason: "Repeated policy violations"
        })
      }
    );

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }

  const validationApplication = express();

  validationApplication.use(express.json());
  validationApplication.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      revokeAdminAccessHandler: async () => ({
        message: "Admin access revoked"
      })
    })
  );

  server = await startTestServer(validationApplication);

  try {
    let response = await fetch(`${server.baseUrl}/admin/auth/admins/not-a-uuid/revoke`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        reason: "Repeated policy violations"
      })
    });

    expect(response.status).toBe(400);

    response = await fetch(
      `${server.baseUrl}/admin/auth/admins/11111111-2222-3333-4444-555555555555/revoke`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer any-token"
        },
        body: JSON.stringify({
          reason: ""
        })
      }
    );

    expect(response.status).toBe(400);
  } finally {
    await server.close();
  }
});

test("PUT /admin/auth/admins/:id/revoke returns 200 on success and maps not-found and conflict errors", async () => {
  const successApplication = express();

  successApplication.use(express.json());
  successApplication.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      revokeAdminAccessHandler: async () => ({
        message: "Admin access revoked"
      })
    })
  );

  let server = await startTestServer(successApplication);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/auth/admins/11111111-2222-3333-4444-555555555555/revoke`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer any-token"
        },
        body: JSON.stringify({
          reason: "Repeated policy violations"
        })
      }
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.message).toBe("Admin access revoked");
  } finally {
    await server.close();
  }

  const notFoundApplication = express();

  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      revokeAdminAccessHandler: async () => {
        throw new AdminAccountNotFoundError("Admin account not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/auth/admins/11111111-2222-3333-4444-555555555555/revoke`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(404);
  } finally {
    await server.close();
  }

  const conflictApplication = express();

  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/auth",
    createAdminAccountsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      revokeAdminAccessHandler: async () => {
        throw new AdminAccountConflictError("Admin access has already been revoked");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(
      `${server.baseUrl}/admin/auth/admins/11111111-2222-3333-4444-555555555555/revoke`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});
