import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminKycRouter } from "../../src/modules/admin-kyc/routes";
import { listPendingKycSubmissions } from "../../src/modules/admin-kyc/service";

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

test("listPendingKycSubmissions uses the latest real KYC submission per user and maps the response payload", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listPendingKycSubmissions(
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
            username: "seller_117825241",
            kycType: "individual_seller",
            submittedAt: new Date("2026-03-31T04:26:08.916Z")
          },
          {
            username: "logistic_140941420",
            kycType: "registered_logistic",
            submittedAt: new Date("2026-03-31T04:26:12.744Z")
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("WITH latest_kyc AS");
  expect(executedQueries[0]?.text).toContain("ROW_NUMBER() OVER");
  expect(executedQueries[0]?.text).toContain('u."kycStatus" = 0');
  expect(executedQueries[0]?.text).toContain('u."userTypeId" IN (2, 3)');
  expect(executedQueries[0]?.text).toContain('ORDER BY ps."submittedAt" DESC');
  expect(executedQueries[0]?.params).toEqual([20, 0]);
  expect(executedQueries[1]?.params).toEqual([]);
  expect(response).toEqual({
    submissions: [
      {
        username: "seller_117825241",
        kycType: "individual_seller",
        status: "pending",
        submittedAt: "2026-03-31T04:26:08.916Z"
      },
      {
        username: "logistic_140941420",
        kycType: "registered_logistic",
        status: "pending",
        submittedAt: "2026-03-31T04:26:12.744Z"
      }
    ],
    total: 2
  });
});

test("listPendingKycSubmissions applies the derived KYC type filter consistently to rows and total count", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  await listPendingKycSubmissions(
    {
      type: "registered_logistic",
      page: 2,
      limit: 10
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
  expect(executedQueries[0]?.text).toContain('ps."kycType" = $1');
  expect(executedQueries[0]?.params).toEqual(["registered_logistic", 10, 10]);
  expect(executedQueries[1]?.params).toEqual(["registered_logistic"]);
});

test("GET /admin/kyc/pending returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/pending`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/pending returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listPendingKycSubmissionsHandler: async () => ({
        submissions: [],
        total: 0
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/kyc/pending`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/pending validates query parameters", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listPendingKycSubmissionsHandler: async () => ({
        submissions: [],
        total: 0
      })
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/kyc/pending?type=buyer`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/kyc/pending?page=0`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/kyc/pending?limit=abc`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });
    expect(response.status).toBe(400);
  } finally {
    await server.close();
  }
});

test("GET /admin/kyc/pending parses filters, defaults page, caps limit, and returns pending submissions", async () => {
  const application = express();

  application.use(
    "/admin/kyc",
    createAdminKycRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listPendingKycSubmissionsHandler: async (filters) => {
        expect(filters.type).toBe("registered_company");
        expect(filters.page).toBe(1);
        expect(filters.limit).toBe(100);

        return {
          submissions: [
            {
              username: "seller_117825241",
              kycType: "registered_company",
              status: "pending",
              submittedAt: "2026-03-31T04:26:08.916Z"
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
      `${server.baseUrl}/admin/kyc/pending?type=registered_company&limit=200`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      submissions: Array<Record<string, unknown>>;
      total: number;
    };

    expect(payload.total).toBe(1);
    expect(payload.submissions).toEqual([
      {
        username: "seller_117825241",
        kycType: "registered_company",
        status: "pending",
        submittedAt: "2026-03-31T04:26:08.916Z"
      }
    ]);
  } finally {
    await server.close();
  }
});
