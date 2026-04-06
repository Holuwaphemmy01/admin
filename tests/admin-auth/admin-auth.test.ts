import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";
import jwt from "jsonwebtoken";

import app from "../../src/app";
import { clearAdminAuthConfigCache, loadAdminAuthConfig } from "../../src/modules/admin-auth/config";
import { authenticateAdmin } from "../../src/modules/admin-auth/middleware";
import adminAuthRouter from "../../src/modules/admin-auth/routes";
import { loginAdmin, verifyAdminToken } from "../../src/modules/admin-auth/service";

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
  ADMIN_JWT_EXPIRES_IN: "1d"
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

test("loadAdminAuthConfig validates and normalizes the embedded super admin settings", () => {
  const config = loadAdminAuthConfig(testEnv);

  assert.equal(config.superAdmin.username, "BrickPine-Admin");
  assert.equal(config.superAdmin.normalizedUsername, "brickpine-admin");
  assert.equal(config.superAdmin.normalizedEmailAddress, "admin@brickpine.local");
  assert.equal(config.superAdmin.normalizedPhoneNumber, "+2348012345678");
  assert.equal(config.superAdmin.createdAt, "2026-01-01T00:00:00.000Z");
});

test("loadAdminAuthConfig fails fast for missing required admin auth values", () => {
  assert.throws(
    () =>
      loadAdminAuthConfig({
        ...testEnv,
        ADMIN_JWT_SECRET: ""
      }),
    /ADMIN_JWT_SECRET/
  );
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

  assert.equal(usernameLogin.username, "BrickPine-Admin");
  assert.equal(emailLogin.username, "BrickPine-Admin");
  assert.equal(phoneLogin.username, "BrickPine-Admin");
  assert.equal(usernameLogin.emailAddress, "admin@brickpine.local");
  assert.equal(usernameLogin.userTypeId, 4);
  assert.equal(usernameLogin.createdAt, "2026-01-01T00:00:00.000Z");

  const payload = verifyAdminToken(usernameLogin.token, config);

  assert.equal(payload.sub, "env:super-admin");
  assert.equal(payload.scope, "admin");
  assert.equal(payload.role, "super_admin");
  assert.equal(payload.username, "BrickPine-Admin");
  assert.equal(payload.emailAddress, "admin@brickpine.local");
  assert.equal(payload.userTypeId, 4);
});

test("loginAdmin rejects unknown identifiers and wrong passwords with a generic auth error", () => {
  const config = loadAdminAuthConfig(testEnv);

  assert.throws(
    () =>
      loginAdmin(
        {
          username: "unknown-admin",
          password: "change-me"
        },
        config
      ),
    /Invalid admin credentials/
  );

  assert.throws(
    () =>
      loginAdmin(
        {
          username: "brickpine-admin",
          password: "wrong-password"
        },
        config
      ),
    /Invalid admin credentials/
  );
});

test("POST /admin/auth/login validates request body, returns 401 for bad credentials, and returns admin session data on success", async () => {
  const previousEnv = applyTestEnv();
  const application = express();

  application.use(express.json());
  application.use("/admin/auth", adminAuthRouter);

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

    assert.equal(response.status, 400);

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

    assert.equal(response.status, 401);

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

    assert.equal(response.status, 200);

    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(payload.username, "BrickPine-Admin");
    assert.equal(payload.firstName, "BrickPine");
    assert.equal(payload.lastName, "SuperAdmin");
    assert.equal(payload.emailAddress, "admin@brickpine.local");
    assert.equal(payload.userTypeId, 4);
    assert.equal(typeof payload.token, "string");
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
    const adminToken = loginAdmin(
      {
        username: "brickpine-admin",
        password: "change-me"
      },
      config
    ).token;
    const customerLikeToken = jwt.sign(
      {
        scope: "customer",
        role: "buyer",
        username: "buyer-1",
        emailAddress: "buyer@example.com",
        userTypeId: 2
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

    let response = await fetch(`${server.baseUrl}/protected`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.equal(response.status, 200);

    const successPayload = (await response.json()) as Record<string, unknown>;

    assert.equal(successPayload.username, "BrickPine-Admin");

    response = await fetch(`${server.baseUrl}/protected`, {
      headers: {
        Authorization: `Bearer ${customerLikeToken}`
      }
    });

    assert.equal(response.status, 401);
  } finally {
    await server.close();
    restoreEnv(previousEnv);
  }
});

test("GET /docs.json exposes the swagger specification for the API", async () => {
  const server = await startTestServer(app);

  try {
    const response = await fetch(`${server.baseUrl}/docs.json`);

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      info?: { title?: string };
      paths?: Record<string, unknown>;
    };

    assert.equal(payload.info?.title, "BrickPine Admin API");
    assert.ok(payload.paths?.["/admin/auth/login"]);
    assert.ok(payload.paths?.["/api/health"]);
  } finally {
    await server.close();
  }
});
