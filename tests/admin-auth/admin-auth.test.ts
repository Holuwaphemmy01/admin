import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import { QueryResult, QueryResultRow } from "pg";

import app from "../../src/app";
import { clearAdminAuthConfigCache, loadAdminAuthConfig } from "../../src/modules/admin-auth/config";
import { authenticateAdmin } from "../../src/modules/admin-auth/middleware";
import { createAdminAuthRouter } from "../../src/modules/admin-auth/routes";
import {
  AdminInviteConflictError,
  createAdminInvite,
  loginAdmin,
  verifyAdminToken
} from "../../src/modules/admin-auth/service";
import { AdminAuthConfig, AdminInviteRequest, AdminRole } from "../../src/modules/admin-auth/types";

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

function signTestAdminToken(config: AdminAuthConfig, role: AdminRole = "super_admin"): string {
  return jwt.sign(
    {
      scope: "admin",
      role,
      username: config.superAdmin.username,
      emailAddress: config.superAdmin.emailAddress,
      userTypeId: config.superAdmin.userTypeId
    },
    config.jwt.secret,
    {
      algorithm: "HS256",
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      subject: config.jwt.subject,
      expiresIn: "1d"
    }
  );
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

test("loginAdmin accepts username, email, and phone and always returns the canonical admin profile", () => {
  const config = loadAdminAuthConfig(testEnv);

  const usernameLogin = loginAdmin(
    {
      username: " brickpine-admin ",
      password: "change-me"
    },
    config
  );
  const emailLogin = loginAdmin(
    {
      username: "ADMIN@BRICKPINE.LOCAL",
      password: "change-me"
    },
    config
  );
  const phoneLogin = loginAdmin(
    {
      username: "(+234) 801-234-5678",
      password: "change-me"
    },
    config
  );

  expect(usernameLogin.username).toBe("BrickPine-Admin");
  expect(emailLogin.username).toBe("BrickPine-Admin");
  expect(phoneLogin.username).toBe("BrickPine-Admin");
  expect(usernameLogin.emailAddress).toBe("admin@brickpine.local");
  expect(usernameLogin.userTypeId).toBe(4);
  expect(usernameLogin.createdAt).toBe("2026-01-01T00:00:00.000Z");

  const payload = verifyAdminToken(usernameLogin.token, config);

  expect(payload.sub).toBe("env:super-admin");
  expect(payload.scope).toBe("admin");
  expect(payload.role).toBe("super_admin");
  expect(payload.username).toBe("BrickPine-Admin");
  expect(payload.emailAddress).toBe("admin@brickpine.local");
  expect(payload.userTypeId).toBe(4);
});

test("loginAdmin rejects unknown identifiers and wrong passwords with a generic auth error", () => {
  const config = loadAdminAuthConfig(testEnv);

  expect(() =>
    loginAdmin(
      {
        username: "unknown-admin",
        password: "change-me"
      },
      config
    )
  ).toThrow(/Invalid admin credentials/);

  expect(() =>
    loginAdmin(
      {
        username: "brickpine-admin",
        password: "wrong-password"
      },
      config
    )
  ).toThrow(/Invalid admin credentials/);
});

test("createAdminInvite stores a pending invite and queues an admin-invite email", async () => {
  const config = loadAdminAuthConfig(testEnv);
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  const createdAt = new Date("2026-04-06T12:00:00.000Z");

  const inviteRequest: AdminInviteRequest = {
    email: " New.Admin@BrickPine.Local ",
    role: "support",
    firstName: "  Jane ",
    lastName: " Doe  ",
    invitedByAdmin: {
      sub: "env:super-admin",
      scope: "admin",
      role: "super_admin",
      username: config.superAdmin.username,
      emailAddress: config.superAdmin.emailAddress,
      userTypeId: config.superAdmin.userTypeId
    }
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
  expect(executedQueries).toHaveLength(4);

  const inviteInsertParams = executedQueries[2]?.params ?? [];
  const emailInsertParams = executedQueries[3]?.params ?? [];

  expect(inviteInsertParams[0]).toBe("8b8a2c88-c4f4-4a9d-b6d0-26fcb6d82770");
  expect(inviteInsertParams[1]).toBe("new.admin@brickpine.local");
  expect(inviteInsertParams[2]).toBe("support");
  expect(inviteInsertParams[3]).toBe("Jane");
  expect(inviteInsertParams[4]).toBe("Doe");
  expect(inviteInsertParams[5]).toBe("pending");
  expect(inviteInsertParams[6]).toBe("hashed-invite-token");
  expect(String(inviteInsertParams[6])).not.toContain("raw-invite-token");
  expect((inviteInsertParams[7] as Date).toISOString()).toBe("2026-04-13T12:00:00.000Z");
  expect(inviteInsertParams[8]).toBe("BrickPine-Admin");
  expect(inviteInsertParams[9]).toBe("admin@brickpine.local");

  expect(emailInsertParams[0]).toBe("admin@brickpine.local");
  expect(emailInsertParams[1]).toBe("new.admin@brickpine.local");
  expect(emailInsertParams[2]).toBe("BrickPine Admin Invite - Support");
  expect(String(emailInsertParams[3])).toMatch(/inviteId=8b8a2c88-c4f4-4a9d-b6d0-26fcb6d82770/);
  expect(String(emailInsertParams[3])).toMatch(/token=raw-invite-token/);
  expect(emailInsertParams[4]).toBe("admin-invite");
  expect(emailInsertParams[5]).toBe("1");
});

test("createAdminInvite rejects emails that already belong to an existing platform user", async () => {
  const config = loadAdminAuthConfig(testEnv);

  await expect(
    createAdminInvite(
      {
        email: "existing@brickpine.local",
        role: "support",
        firstName: "Existing",
        lastName: "User",
        invitedByAdmin: {
          sub: "env:super-admin",
          scope: "admin",
          role: "super_admin",
          username: config.superAdmin.username,
          emailAddress: config.superAdmin.emailAddress,
          userTypeId: config.superAdmin.userTypeId
        }
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
        invitedByAdmin: {
          sub: "env:super-admin",
          scope: "admin",
          role: "super_admin",
          username: config.superAdmin.username,
          emailAddress: config.superAdmin.emailAddress,
          userTypeId: config.superAdmin.userTypeId
        }
      },
      {
        config,
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes('FROM public."user"')) {
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
  const previousEnv = applyTestEnv();
  const application = express();

  application.use(express.json());
  application.use("/admin/auth", createAdminAuthRouter());

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
        username: "brickpine-admin",
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
    expect(typeof payload.token).toBe("string");
  } finally {
    await server.close();
    restoreEnv(previousEnv);
  }
});

test("POST /admin/auth/invite returns 401 when the admin token is missing", async () => {
  const previousEnv = applyTestEnv();
  const application = express();

  application.use(express.json());
  application.use("/admin/auth", createAdminAuthRouter());

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: "support-admin@brickpine.local",
        role: "support",
        firstName: "Support",
        lastName: "Admin"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
    restoreEnv(previousEnv);
  }
});

test("POST /admin/auth/invite rejects customer-like tokens with 401", async () => {
  const previousEnv = applyTestEnv();
  const config = loadAdminAuthConfig(process.env);
  const application = express();

  application.use(express.json());
  application.use("/admin/auth", createAdminAuthRouter());

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createCustomerLikeToken(config)}`
      },
      body: JSON.stringify({
        email: "support-admin@brickpine.local",
        role: "support",
        firstName: "Support",
        lastName: "Admin"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
    restoreEnv(previousEnv);
  }
});

test("POST /admin/auth/invite returns 403 for authenticated admins without the super_admin role", async () => {
  const previousEnv = applyTestEnv();
  const config = loadAdminAuthConfig(process.env);
  const application = express();

  application.use(express.json());
  application.use("/admin/auth", createAdminAuthRouter());

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signTestAdminToken(config, "support")}`
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
    restoreEnv(previousEnv);
  }
});

test("POST /admin/auth/invite validates email, role, and name fields before calling the service", async () => {
  const previousEnv = applyTestEnv();
  const config = loadAdminAuthConfig(process.env);
  let inviteCallCount = 0;
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/auth",
    createAdminAuthRouter({
      createAdminInviteHandler: async () => {
        inviteCallCount += 1;

        return {
          message: "Invite sent successfully",
          inviteId: "should-not-run"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signTestAdminToken(config)}`
      },
      body: JSON.stringify({
        email: "not-an-email",
        role: "support",
        firstName: "Support",
        lastName: "Admin"
      })
    });

    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signTestAdminToken(config)}`
      },
      body: JSON.stringify({
        email: "support-admin@brickpine.local",
        role: "operations",
        firstName: "Support",
        lastName: "Admin"
      })
    });

    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signTestAdminToken(config)}`
      },
      body: JSON.stringify({
        email: "support-admin@brickpine.local",
        role: "support",
        firstName: "Support"
      })
    });

    expect(response.status).toBe(400);
    expect(inviteCallCount).toBe(0);
  } finally {
    await server.close();
    restoreEnv(previousEnv);
  }
});

test("POST /admin/auth/invite returns 201 with the invite id when the request succeeds", async () => {
  const previousEnv = applyTestEnv();
  const config = loadAdminAuthConfig(process.env);
  let invitedByUsername = "";
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/auth",
    createAdminAuthRouter({
      createAdminInviteHandler: async (invite) => {
        invitedByUsername = invite.invitedByAdmin.username;

        return {
          message: "Invite sent successfully",
          inviteId: "11111111-2222-3333-4444-555555555555"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signTestAdminToken(config)}`
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

    expect(payload.message).toBe("Invite sent successfully");
    expect(payload.inviteId).toBe("11111111-2222-3333-4444-555555555555");
    expect(invitedByUsername).toBe("BrickPine-Admin");
  } finally {
    await server.close();
    restoreEnv(previousEnv);
  }
});

test("POST /admin/auth/invite returns 409 when the invite conflicts with existing data", async () => {
  const previousEnv = applyTestEnv();
  const config = loadAdminAuthConfig(process.env);
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/auth",
    createAdminAuthRouter({
      createAdminInviteHandler: async () => {
        throw new AdminInviteConflictError("An admin invite is already pending for this email address");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/auth/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signTestAdminToken(config)}`
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
    restoreEnv(previousEnv);
  }
});

test("authenticateAdmin accepts valid admin tokens and rejects customer-like tokens", async () => {
  const previousEnv = applyTestEnv();
  const config = loadAdminAuthConfig(process.env);
  const application = express();

  application.get("/protected", authenticateAdmin, (request, response) => {
    response.json({
      username: request.admin?.username
    });
  });

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/protected`, {
      headers: {
        Authorization: `Bearer ${signTestAdminToken(config)}`
      }
    });

    expect(response.status).toBe(200);

    const successPayload = (await response.json()) as Record<string, unknown>;

    expect(successPayload.username).toBe("BrickPine-Admin");

    response = await fetch(`${server.baseUrl}/protected`, {
      headers: {
        Authorization: `Bearer ${createCustomerLikeToken(config)}`
      }
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
    restoreEnv(previousEnv);
  }
});

test("GET /docs.json exposes the swagger specification for the API", async () => {
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
    expect(payload.paths?.["/api/health"]).toBeDefined();
  } finally {
    await server.close();
  }
});
