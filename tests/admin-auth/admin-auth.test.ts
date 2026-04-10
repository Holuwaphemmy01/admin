import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { QueryResult, QueryResultRow } from "pg";

import app from "../../src/app";
import { clearAdminAuthConfigCache, loadAdminAuthConfig } from "../../src/modules/admin-auth/config";
import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { createAdminAuthRouter } from "../../src/modules/admin-auth/routes";
import {
  AdminAuthenticationError,
  AdminInviteConflictError,
  AdminPasswordChangeError,
  authenticateAdminToken,
  changeAdminPassword,
  createAdminInvite,
  ensureSuperAdminSeeded,
  loginAdmin,
  signAdminToken,
  verifyAdminToken
} from "../../src/modules/admin-auth/service";
import {
  AdminAuthConfig,
  AdminInviteRequest,
  AdminRole,
  AuthenticatedAdmin
} from "../../src/modules/admin-auth/types";

const testEnv: NodeJS.ProcessEnv = {
  ADMIN_SUPER_USERNAME: "BrickPine-Admin",
  ADMIN_SUPER_EMAIL: "admin@brickpine.local",
  ADMIN_SUPER_PHONE: "+234 801-234-5678",
  ADMIN_SUPER_PASSWORD: "change-me",
  ADMIN_SUPER_FIRST_NAME: "BrickPine",
  ADMIN_SUPER_LAST_NAME: "SuperAdmin",
  ADMIN_SUPER_USER_TYPE_ID: "4",
  ADMIN_SUPER_CREATED_AT: "2026-01-01T00:00:00.000Z",
  ADMIN_JWT_SECRET: "brickpine-admin-secret",
  ADMIN_JWT_EXPIRES_IN: "1d",
  ADMIN_INVITE_FRONTEND_URL: "http://localhost:5173/admin/invite"
};

function restoreEnv(previousEnv: NodeJS.ProcessEnv): void {
  process.env = previousEnv;
  clearAdminAuthConfigCache();
}

function applyTestEnv(): NodeJS.ProcessEnv {
  const previousEnv = process.env;

  process.env = {
    ...process.env,
    ...testEnv
  };
  clearAdminAuthConfigCache();

  return previousEnv;
}

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

function createQueryFunction(
  queryImplementation: (text: string, params?: unknown[]) => Promise<QueryResult<QueryResultRow>>
) {
  return async <T extends QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> => {
    const result = await queryImplementation(text, params);

    return result as unknown as QueryResult<T>;
  };
}

function createBootstrappedSuperAdminRunInTransaction(superAdminId = "seeded-super-admin-id") {
  return async <T>(operation: (client: { query: never }) => Promise<T>) =>
    operation(
      createTransactionClient(async (text) => {
        if (text.includes('SELECT id FROM public.admin_users WHERE "emailAddress" = $1')) {
          return createQueryResult([{ id: superAdminId }]);
        }

        if (
          text.includes(
            'SELECT "adminUserId" FROM public.admin_credentials WHERE "adminUserId" = $1'
          )
        ) {
          return createQueryResult([{ adminUserId: superAdminId }]);
        }

        return createQueryResult([]);
      }) as never
    );
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

function allowAuthenticatedAdmin(admin: AuthenticatedAdmin = createAuthenticatedAdmin()): RequestHandler {
  return (request, _response, next) => {
    request.admin = admin;
    next();
  };
}

function createCustomerLikeToken(config: AdminAuthConfig): string {
  return jwt.sign(
    {
      scope: "customer",
      role: "buyer",
      username: "buyer-1",
      emailAddress: "buyer@example.com",
      userTypeId: 1
    },
    config.jwt.secret,
    {
      algorithm: "HS256",
      issuer: "brickpine-customer",
      audience: "customer-api",
      subject: "customer:1",
      expiresIn: "1d"
    }
  );
}

test("loadAdminAuthConfig validates and normalizes the embedded super admin settings", () => {
  const config = loadAdminAuthConfig(testEnv);

  expect(config.superAdmin.username).toBe("BrickPine-Admin");
  expect(config.superAdmin.normalizedUsername).toBe("brickpine-admin");
  expect(config.superAdmin.normalizedEmailAddress).toBe("admin@brickpine.local");
  expect(config.superAdmin.normalizedPhoneNumber).toBe("+2348012345678");
  expect(config.superAdmin.createdAt).toBe("2026-01-01T00:00:00.000Z");
  expect(config.invite.frontendUrl).toBe("http://localhost:5173/admin/invite");
  expect(config.invite.expiryDays).toBe(7);
});

test("loadAdminAuthConfig fails fast for missing required admin auth values", () => {
  expect(() =>
    loadAdminAuthConfig({
      ...testEnv,
      ADMIN_JWT_SECRET: ""
    })
  ).toThrow(/ADMIN_JWT_SECRET/);

  expect(() =>
    loadAdminAuthConfig({
      ...testEnv,
      ADMIN_INVITE_FRONTEND_URL: ""
    })
  ).toThrow(/ADMIN_INVITE_FRONTEND_URL/);
});

test("ensureSuperAdminSeeded inserts the super admin user and credentials when missing", async () => {
  const config = loadAdminAuthConfig(testEnv);
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  await ensureSuperAdminSeeded({
    config,
    uuidFactory: () => "seeded-admin-id",
    nowFactory: () => new Date("2026-04-07T10:00:00.000Z"),
    passwordHasher: async (value, rounds) => `hashed:${value}:${rounds}`,
    runInTransaction: async (operation) =>
      operation(
        createTransactionClient(async (text, params) => {
          executedQueries.push({ text, params });

          if (text.includes('SELECT id FROM public.admin_users WHERE "emailAddress" = $1')) {
            return createQueryResult([]);
          }

          if (
            text.includes(
              'SELECT "adminUserId" FROM public.admin_credentials WHERE "adminUserId" = $1'
            )
          ) {
            return createQueryResult([]);
          }

          return createQueryResult([]);
        })
      )
  });

  expect(executedQueries).toHaveLength(4);
  expect(executedQueries[1]?.text).toContain("INSERT INTO public.admin_users");
  expect(executedQueries[3]?.text).toContain("INSERT INTO public.admin_credentials");
  expect(executedQueries[1]?.params?.[0]).toBe("seeded-admin-id");
  expect(executedQueries[1]?.params?.[6]).toBe("super_admin");
  expect(executedQueries[1]?.params?.[8]).toBe("active");
  expect(executedQueries[3]?.params?.[1]).toBe("hashed:change-me:12");
});

test("ensureSuperAdminSeeded does not insert duplicate admin users or credentials when the super admin is already seeded", async () => {
  const config = loadAdminAuthConfig(testEnv);
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  await ensureSuperAdminSeeded({
    config,
    passwordHasher: async (value, rounds) => `hashed:${value}:${rounds}`,
    runInTransaction: async (operation) =>
      operation(
        createTransactionClient(async (text, params) => {
          executedQueries.push({ text, params });

          if (text.includes('SELECT id FROM public.admin_users WHERE "emailAddress" = $1')) {
            return createQueryResult([
              {
                id: "existing-admin-id"
              }
            ]);
          }

          if (
            text.includes(
              'SELECT "adminUserId" FROM public.admin_credentials WHERE "adminUserId" = $1'
            )
          ) {
            return createQueryResult([
              {
                adminUserId: "existing-admin-id"
              }
            ]);
          }

          return createQueryResult([]);
        })
      )
  });

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.params).toEqual([config.superAdmin.emailAddress]);
  expect(executedQueries[1]?.params).toEqual(["existing-admin-id"]);
  expect(executedQueries.some((query) => query.text.includes("INSERT INTO public.admin_users"))).toBe(
    false
  );
  expect(
    executedQueries.some((query) => query.text.includes("INSERT INTO public.admin_credentials"))
  ).toBe(false);
});

test("loginAdmin accepts username, email, and phone for active DB-backed admins", async () => {
  const config = loadAdminAuthConfig(testEnv);
  const adminRow = {
    id: "admin-user-id",
    username: "BrickPine-Admin",
    emailAddress: "admin@brickpine.local",
    phoneNumber: "+2348012345678",
    firstName: "BrickPine",
    lastName: "SuperAdmin",
    role: "super_admin" as AdminRole,
    userTypeId: 4,
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordHash: "stored-hash",
    passwordVersion: 3
  };

  const queryFn = async <T extends QueryResultRow>(text: string, params?: unknown[]) => {
    expect(text).toContain("au.status = 'active'");

    if (
      params?.[0] === "brickpine-admin" ||
      params?.[0] === "admin@brickpine.local" ||
      params?.[0] === "+2348012345678"
    ) {
      return createQueryResult([adminRow]) as unknown as QueryResult<T>;
    }

    return createQueryResult([]) as unknown as QueryResult<T>;
  };

  const usernameLogin = await loginAdmin(
    {
      username: " brickpine-admin ",
      password: "change-me"
    },
    {
      config,
      queryFn,
      runInTransaction: createBootstrappedSuperAdminRunInTransaction(),
      passwordComparer: async () => true
    }
  );
  const emailLogin = await loginAdmin(
    {
      username: "ADMIN@BRICKPINE.LOCAL",
      password: "change-me"
    },
    {
      config,
      queryFn,
      runInTransaction: createBootstrappedSuperAdminRunInTransaction(),
      passwordComparer: async () => true
    }
  );
  const phoneLogin = await loginAdmin(
    {
      username: "(+234) 801-234-5678",
      password: "change-me"
    },
    {
      config,
      queryFn,
      runInTransaction: createBootstrappedSuperAdminRunInTransaction(),
      passwordComparer: async () => true
    }
  );

  expect(usernameLogin.username).toBe("BrickPine-Admin");
  expect(emailLogin.username).toBe("BrickPine-Admin");
  expect(phoneLogin.username).toBe("BrickPine-Admin");
  expect(usernameLogin.emailAddress).toBe("admin@brickpine.local");
  expect(usernameLogin.userTypeId).toBe(4);
  expect(usernameLogin.createdAt).toBe("2026-01-01T00:00:00.000Z");

  const payload = verifyAdminToken(usernameLogin.token, config);

  expect(payload.sub).toBe("admin-user-id");
  expect(payload.scope).toBe("admin");
  expect(payload.role).toBe("super_admin");
  expect(payload.username).toBe("BrickPine-Admin");
  expect(payload.emailAddress).toBe("admin@brickpine.local");
  expect(payload.userTypeId).toBe(4);
  expect(payload.passwordVersion).toBe(3);
});

test("loginAdmin rejects unknown identifiers and wrong passwords with a generic auth error", async () => {
  const config = loadAdminAuthConfig(testEnv);

  await expect(
    loginAdmin(
      {
        username: "unknown-admin",
        password: "change-me"
      },
      {
        config,
        queryFn: createQueryFunction(async () => createQueryResult([])),
        runInTransaction: createBootstrappedSuperAdminRunInTransaction()
      }
    )
  ).rejects.toThrow("Invalid admin credentials");

  await expect(
    loginAdmin(
      {
        username: "brickpine-admin",
        password: "wrong-password"
      },
      {
        config,
        queryFn: createQueryFunction(async () =>
          createQueryResult([
            {
              id: "admin-user-id",
              username: "BrickPine-Admin",
              emailAddress: "admin@brickpine.local",
              phoneNumber: "+2348012345678",
              firstName: "BrickPine",
              lastName: "SuperAdmin",
              role: "super_admin" as AdminRole,
              userTypeId: 4,
              status: "active",
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              passwordHash: "stored-hash",
              passwordVersion: 1
            }
          ])
        ),
        runInTransaction: createBootstrappedSuperAdminRunInTransaction(),
        passwordComparer: async () => false
      }
    )
  ).rejects.toThrow("Invalid admin credentials");
});

test("authenticateAdminToken accepts valid tokens and rejects customer-like tokens", async () => {
  const config = loadAdminAuthConfig(testEnv);
  const validToken = signAdminToken(createAuthenticatedAdmin({ passwordVersion: 2 }), config);

  const authenticatedAdmin = await authenticateAdminToken(validToken, {
    config,
    queryFn: createQueryFunction(async () =>
      createQueryResult([
        {
          id: "admin-user-id",
          username: "brickpine-admin",
          emailAddress: "admin@brickpine.local",
          firstName: "BrickPine",
          lastName: "SuperAdmin",
          role: "super_admin" as AdminRole,
          userTypeId: 4,
          status: "active",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          passwordVersion: 2
        }
      ])
    )
  });

  expect(authenticatedAdmin.username).toBe("brickpine-admin");

  await expect(
    authenticateAdminToken(createCustomerLikeToken(config), {
      config,
      queryFn: createQueryFunction(async () => createQueryResult([]))
    })
  ).rejects.toThrow();
});

test("authenticateAdminToken rejects suspended or revoked admins and stale password-version tokens", async () => {
  const config = loadAdminAuthConfig(testEnv);
  const staleToken = signAdminToken(createAuthenticatedAdmin({ passwordVersion: 1 }), config);
  const suspendedToken = signAdminToken(createAuthenticatedAdmin({ passwordVersion: 2 }), config);
  const revokedToken = signAdminToken(createAuthenticatedAdmin({ passwordVersion: 2 }), config);

  await expect(
    authenticateAdminToken(staleToken, {
      config,
      queryFn: createQueryFunction(async () =>
        createQueryResult([
          {
            id: "admin-user-id",
            username: "brickpine-admin",
            emailAddress: "admin@brickpine.local",
            firstName: "BrickPine",
            lastName: "SuperAdmin",
            role: "super_admin" as AdminRole,
            userTypeId: 4,
            status: "active",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            passwordVersion: 2
          }
        ])
      )
    })
  ).rejects.toThrow();

  await expect(
    authenticateAdminToken(suspendedToken, {
      config,
      queryFn: createQueryFunction(async () =>
        createQueryResult([
          {
            id: "admin-user-id",
            username: "brickpine-admin",
            emailAddress: "admin@brickpine.local",
            firstName: "BrickPine",
            lastName: "SuperAdmin",
            role: "super_admin" as AdminRole,
            userTypeId: 4,
            status: "suspended",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            passwordVersion: 2
          }
        ])
      )
    })
  ).rejects.toThrow();

  await expect(
    authenticateAdminToken(revokedToken, {
      config,
      queryFn: createQueryFunction(async () =>
        createQueryResult([
          {
            id: "admin-user-id",
            username: "brickpine-admin",
            emailAddress: "admin@brickpine.local",
            firstName: "BrickPine",
            lastName: "SuperAdmin",
            role: "super_admin" as AdminRole,
            userTypeId: 4,
            status: "revoked",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            passwordVersion: 2
          }
        ])
      )
    })
  ).rejects.toThrow();
});

test("changeAdminPassword updates the password hash and increments password version", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  const admin = createAuthenticatedAdmin();

  const response = await changeAdminPassword(
    {
      currentPassword: "change-me",
      newPassword: "new-password-123",
      admin
    },
    {
      nowFactory: () => new Date("2026-04-07T12:00:00.000Z"),
      passwordComparer: async () => true,
      passwordHasher: async (value, rounds) => `hashed:${value}:${rounds}`,
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            executedQueries.push({ text, params });

            if (text.includes("FOR UPDATE OF ac")) {
              return createQueryResult([
                {
                  id: admin.sub,
                  username: admin.username,
                  emailAddress: admin.emailAddress,
                  phoneNumber: "+2348012345678",
                  firstName: "BrickPine",
                  lastName: "SuperAdmin",
                  role: admin.role,
                  userTypeId: admin.userTypeId,
                  status: "active",
                  createdAt: new Date("2026-01-01T00:00:00.000Z"),
                  passwordHash: "old-hash",
                  passwordVersion: 1
                }
              ]);
            }

            return createQueryResult([]);
          })
        )
    }
  );

  expect(response).toEqual({
    message: "Password updated successfully"
  });
  expect(executedQueries[1]?.text).toContain("UPDATE public.admin_credentials");
  expect(executedQueries[1]?.params?.[0]).toBe("hashed:new-password-123:12");
  expect(executedQueries[1]?.params?.[2]).toBe("admin-user-id");
});

test("changeAdminPassword rejects invalid or incorrect password change requests", async () => {
  const admin = createAuthenticatedAdmin();

  await expect(
    changeAdminPassword({
      currentPassword: "same-password",
      newPassword: "same-password",
      admin
    })
  ).rejects.toThrow("newPassword must be different from currentPassword");

  await expect(
    changeAdminPassword({
      currentPassword: "change-me",
      newPassword: "short",
      admin
    })
  ).rejects.toThrow("newPassword must be between 8 and 72 characters");

  await expect(
    changeAdminPassword(
      {
        currentPassword: "wrong-password",
        newPassword: "new-password-123",
        admin
      },
      {
        passwordComparer: async () => false,
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("FOR UPDATE OF ac")) {
                return createQueryResult([
                  {
                    id: admin.sub,
                    username: admin.username,
                    emailAddress: admin.emailAddress,
                    phoneNumber: "+2348012345678",
                    firstName: "BrickPine",
                    lastName: "SuperAdmin",
                    role: admin.role,
                    userTypeId: admin.userTypeId,
                    status: "active",
                    createdAt: new Date("2026-01-01T00:00:00.000Z"),
                    passwordHash: "old-hash",
                    passwordVersion: 1
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("currentPassword is incorrect");
});

test("createAdminInvite stores a pending invite and queues an admin-invite email", async () => {
  const config = loadAdminAuthConfig(testEnv);
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  const createdAt = new Date("2026-04-07T12:00:00.000Z");

  const inviteRequest: AdminInviteRequest = {
    email: " New.Admin@BrickPine.Local ",
    role: "support",
    firstName: "  Jane ",
    lastName: " Doe  ",
    invitedByAdmin: createAuthenticatedAdmin({
      username: "BrickPine-Admin"
    })
  };

  const response = await createAdminInvite(inviteRequest, {
    config,
    inviteIdFactory: () => "8b8a2c88-c4f4-4a9d-b6d0-26fcb6d82770",
    inviteTokenFactory: () => "raw-invite-token",
    inviteTokenHasher: () => "hashed-invite-token",
    nowFactory: () => createdAt,
    runInTransaction: async (operation) =>
      operation(
        createTransactionClient(async (text, params) => {
          executedQueries.push({ text, params });

          if (text.includes('FROM public."user"')) {
            return createQueryResult([]);
          }

          if (text.includes("FROM public.admin_users")) {
            return createQueryResult([]);
          }

          if (text.includes("FROM public.admin_invites")) {
            return createQueryResult([]);
          }

          return createQueryResult([]);
        })
      )
  });

  expect(response).toEqual({
    message: "Invite sent successfully",
    inviteId: "8b8a2c88-c4f4-4a9d-b6d0-26fcb6d82770"
  });
  expect(executedQueries).toHaveLength(5);

  const inviteInsertParams = executedQueries[3]?.params ?? [];
  const emailInsertParams = executedQueries[4]?.params ?? [];

  expect(inviteInsertParams[1]).toBe("new.admin@brickpine.local");
  expect(inviteInsertParams[2]).toBe("support");
  expect(inviteInsertParams[6]).toBe("hashed-invite-token");
  expect((inviteInsertParams[7] as Date).toISOString()).toBe("2026-04-14T12:00:00.000Z");
  expect(emailInsertParams[0]).toBe("admin@brickpine.local");
  expect(emailInsertParams[4]).toBe("admin-invite");
  expect(String(emailInsertParams[3])).toMatch(/token=raw-invite-token/);
});

test("createAdminInvite rejects emails that already belong to an existing platform user or admin", async () => {
  const config = loadAdminAuthConfig(testEnv);

  await expect(
    createAdminInvite(
      {
        email: "existing-user@brickpine.local",
        role: "support",
        firstName: "Existing",
        lastName: "User",
        invitedByAdmin: createAuthenticatedAdmin()
      },
      {
        config,
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes('FROM public."user"')) {
                return createQueryResult([{ id: 1 }]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("This email address already belongs to an existing user");

  await expect(
    createAdminInvite(
      {
        email: "existing-admin@brickpine.local",
        role: "support",
        firstName: "Existing",
        lastName: "Admin",
        invitedByAdmin: createAuthenticatedAdmin()
      },
      {
        config,
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes('FROM public."user"')) {
                return createQueryResult([]);
              }

              if (text.includes("FROM public.admin_users")) {
                return createQueryResult([{ id: "admin-user-id" }]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("This email address already belongs to an existing admin");
});

test("createAdminInvite rejects duplicate pending invites for the same email address", async () => {
  const config = loadAdminAuthConfig(testEnv);

  await expect(
    createAdminInvite(
      {
        email: "pending@brickpine.local",
        role: "finance",
        firstName: "Pending",
        lastName: "Invite",
        invitedByAdmin: createAuthenticatedAdmin()
      },
      {
        config,
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes('FROM public."user"')) {
                return createQueryResult([]);
              }

              if (text.includes("FROM public.admin_users")) {
                return createQueryResult([]);
              }

              if (text.includes("FROM public.admin_invites")) {
                return createQueryResult([{ id: "pending-invite-id" }]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("An admin invite is already pending for this email address");
});

test("POST /admin/auth/login validates request body, returns 401 for bad credentials, and returns admin session data on success", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/auth",
    createAdminAuthRouter({
      loginAdminHandler: async ({ username, password }) => {
        if (password !== "change-me" || username === "unknown-admin") {
          throw new AdminAuthenticationError();
        }

        return {
          username: "BrickPine-Admin",
          firstName: "BrickPine",
          lastName: "SuperAdmin",
          emailAddress: "admin@brickpine.local",
          userTypeId: 4,
          token: "admin-jwt-token",
          createdAt: "2026-01-01T00:00:00.000Z"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "",
        password: "change-me"
      })
    });

    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "unknown-admin",
        password: "wrong-password"
      })
    });

    expect(response.status).toBe(401);

    response = await fetch(`${server.baseUrl}/admin/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "admin@brickpine.local",
        password: "change-me"
      })
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.username).toBe("BrickPine-Admin");
    expect(payload.firstName).toBe("BrickPine");
    expect(payload.lastName).toBe("SuperAdmin");
    expect(payload.emailAddress).toBe("admin@brickpine.local");
    expect(payload.userTypeId).toBe(4);
    expect(payload.token).toBe("admin-jwt-token");
  } finally {
    await server.close();
  }
});

test("PUT /admin/auth/change_password returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/auth",
    createAdminAuthRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/change_password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        currentPassword: "change-me",
        newPassword: "new-password-123"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/auth/change_password validates request body and returns success when the request is valid", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/auth",
    createAdminAuthRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      changeAdminPasswordHandler: async () => ({
        message: "Password updated successfully"
      })
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/auth/change_password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        currentPassword: "",
        newPassword: "new-password-123"
      })
    });

    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/auth/change_password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        currentPassword: "change-me",
        newPassword: "new-password-123"
      })
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.message).toBe("Password updated successfully");
  } finally {
    await server.close();
  }
});

test("PUT /admin/auth/change_password returns 400 when the service rejects the password change", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/auth",
    createAdminAuthRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      changeAdminPasswordHandler: async () => {
        throw new AdminPasswordChangeError("currentPassword is incorrect");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/change_password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        currentPassword: "wrong-password",
        newPassword: "new-password-123"
      })
    });

    expect(response.status).toBe(400);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.message).toBe("currentPassword is incorrect");
  } finally {
    await server.close();
  }
});

test("POST /admin/auth/invite enforces admin auth, super-admin role, and conflict handling", async () => {
  const forbiddenApplication = express();

  forbiddenApplication.use(express.json());
  forbiddenApplication.use(
    "/admin/auth",
    createAdminAuthRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      createAdminInviteHandler: async () => ({
        message: "Invite sent successfully",
        inviteId: "ignored"
      })
    })
  );

  let server = await startTestServer(forbiddenApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        email: "support-admin@brickpine.local",
        role: "support",
        firstName: "Support",
        lastName: "Admin"
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }

  const successApplication = express();

  successApplication.use(express.json());
  successApplication.use(
    "/admin/auth",
    createAdminAuthRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createAdminInviteHandler: async ({ invitedByAdmin }) => {
        expect(invitedByAdmin.username).toBe("brickpine-admin");

        return {
          message: "Invite sent successfully",
          inviteId: "11111111-2222-3333-4444-555555555555"
        };
      }
    })
  );

  server = await startTestServer(successApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        email: "support-admin@brickpine.local",
        role: "support",
        firstName: "Support",
        lastName: "Admin"
      })
    });

    expect(response.status).toBe(201);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.inviteId).toBe("11111111-2222-3333-4444-555555555555");
  } finally {
    await server.close();
  }

  const conflictApplication = express();

  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/auth",
    createAdminAuthRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createAdminInviteHandler: async () => {
        throw new AdminInviteConflictError("This email address already belongs to an existing admin");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        email: "support-admin@brickpine.local",
        role: "support",
        firstName: "Support",
        lastName: "Admin"
      })
    });

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});

test("GET /docs.json exposes the swagger specification for the API", async () => {
  const previousEnv = applyTestEnv();
  const server = await startTestServer(app);

  try {
    const response = await fetch(`${server.baseUrl}/docs.json`);

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      info?: { title?: string };
      paths?: Record<string, unknown>;
    };

    expect(payload.info?.title).toBe("BrickPine Admin API");
    expect(payload.paths?.["/admin/auth/login"]).toBeDefined();
    expect(payload.paths?.["/admin/auth/invite"]).toBeDefined();
    expect(payload.paths?.["/admin/auth/change_password"]).toBeDefined();
    expect(payload.paths?.["/admin/auth/admins"]).toBeDefined();
    expect(payload.paths?.["/admin/auth/admins/{id}/revoke"]).toBeDefined();
    expect(payload.paths?.["/admin/delivery/pricing"]).toMatchObject({
      get: expect.any(Object),
      post: expect.any(Object)
    });
    expect(payload.paths?.["/admin/delivery/surge"]).toMatchObject({
      get: expect.any(Object),
      put: expect.any(Object)
    });
    expect(payload.paths?.["/admin/delivery/pricing/{id}"]).toMatchObject({
      put: expect.any(Object),
      delete: expect.any(Object)
    });
    expect(payload.paths?.["/admin/subscriptions"]).toBeDefined();
    expect(payload.paths?.["/admin/subscriptions/plans"]).toBeDefined();
    expect(payload.paths?.["/admin/subscriptions/plans/{id}"]).toMatchObject({
      put: expect.any(Object),
      delete: expect.any(Object)
    });
    expect(payload.paths?.["/admin/subscriptions/{username}/grant"]).toBeDefined();
    expect(payload.paths?.["/admin/subscriptions/{username}/revoke"]).toBeDefined();
    expect(payload.paths?.["/admin/campaigns"]).toBeDefined();
    expect(payload.paths?.["/admin/campaigns/analytics"]).toBeDefined();
    expect(payload.paths?.["/admin/analytics/overview"]).toBeDefined();
    expect(payload.paths?.["/admin/analytics/revenue"]).toBeDefined();
    expect(payload.paths?.["/admin/analytics/top_sellers"]).toBeDefined();
    expect(payload.paths?.["/admin/analytics/top_products"]).toBeDefined();
    expect(payload.paths?.["/admin/support/categories"]).toBeDefined();
    expect(payload.paths?.["/admin/support/tickets"]).toBeDefined();
    expect(payload.paths?.["/admin/support/tickets/{ticketId}"]).toBeDefined();
    expect(payload.paths?.["/admin/support/tickets/{ticketId}/reply"]).toBeDefined();
    expect(payload.paths?.["/admin/support/tickets/{ticketId}/close"]).toBeDefined();
    expect(payload.paths?.["/admin/campaigns/{campaignId}"]).toBeDefined();
    expect(payload.paths?.["/admin/campaigns/{campaignId}/approve"]).toBeDefined();
    expect(payload.paths?.["/admin/campaigns/{campaignId}/reject"]).toBeDefined();
    expect(payload.paths?.["/admin/campaigns/{campaignId}/pause"]).toBeDefined();
    expect(payload.paths?.["/admin/transactions"]).toBeDefined();
    expect(payload.paths?.["/admin/transactions/{transactionId}"]).toBeDefined();
    expect(payload.paths?.["/admin/settlements"]).toBeDefined();
    expect(payload.paths?.["/admin/settlements/stats"]).toBeDefined();
    expect(payload.paths?.["/admin/settlements/{id}/approve"]).toBeDefined();
    expect(payload.paths?.["/admin/settlements/{id}/reject"]).toBeDefined();
    expect(payload.paths?.["/admin/wallet/platform"]).toBeDefined();
    expect(payload.paths?.["/admin/wallet/manual_credit"]).toBeDefined();
    expect(payload.paths?.["/admin/wallet/manual_debit"]).toBeDefined();
    expect(payload.paths?.["/admin/wallet/{username}"]).toBeDefined();
    expect(payload.paths?.["/admin/product/categories"]).toBeDefined();
    expect(payload.paths?.["/admin/product/categories/{id}"]).toMatchObject({
      put: expect.any(Object),
      delete: expect.any(Object)
    });
    expect(payload.paths?.["/admin/product/{productId}/flag"]).toBeDefined();
    expect(payload.paths?.["/admin/products"]).toBeDefined();
    expect(payload.paths?.["/admin/orders"]).toBeDefined();
    expect(payload.paths?.["/admin/orders/stats"]).toBeDefined();
    expect(payload.paths?.["/admin/orders/{orderNumber}"]).toBeDefined();
    expect(payload.paths?.["/admin/orders/{orderNumber}/cancel"]).toBeDefined();
    expect(payload.paths?.["/admin/kyc/pending"]).toBeDefined();
    expect(payload.paths?.["/admin/kyc/stats"]).toBeDefined();
    expect(payload.paths?.["/admin/kyc/{username}"]).toBeDefined();
    expect(payload.paths?.["/admin/kyc/{username}/approve"]).toBeDefined();
    expect(payload.paths?.["/admin/kyc/{username}/reject"]).toBeDefined();
    expect(payload.paths?.["/admin/users"]).toBeDefined();
    expect(payload.paths?.["/admin/users/stats"]).toBeDefined();
    expect(payload.paths?.["/admin/users/{username}"]).toMatchObject({
      get: expect.any(Object),
      delete: expect.any(Object)
    });
    expect(payload.paths?.["/admin/users/{username}/suspend"]).toBeDefined();
    expect(payload.paths?.["/admin/users/{username}/activate"]).toBeDefined();
    expect(payload.paths?.["/api/health"]).toBeDefined();
  } finally {
    await server.close();
    restoreEnv(previousEnv);
  }
});
