import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminUsersRouter } from "../../src/modules/admin-users/routes";
import {
  getPlatformUserProfile,
  listPlatformUsers,
  PlatformUserProfileConflictError,
  PlatformUserProfileNotFoundError,
  PlatformUserProfileValidationError,
  PlatformUserSuspensionConflictError,
  PlatformUserSuspensionNotFoundError,
  PlatformUserSuspensionValidationError,
  suspendPlatformUser
} from "../../src/modules/admin-users/service";

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

test("getPlatformUserProfile returns the full profile payload with bio and placeholder summaries", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getPlatformUserProfile("  BUYER-1  ", {
    queryFn: async <T extends QueryResultRow>(text: string, params?: unknown[]) => {
      executedQueries.push({ text, params });

      return createQueryResult([
        {
          username: "buyer-1",
          firstName: "Jane",
          lastName: "Doe",
          emailAddress: "jane.doe@example.com",
          phoneNumber: "+2348012345678",
          userTypeId: 1,
          createdAt: new Date("2026-04-07T11:00:00.000Z"),
          bio: "Buyer bio",
          profileImage: "https://cdn.example.com/profile.jpg",
          coverImage: "https://cdn.example.com/cover.jpg"
        }
      ]) as unknown as QueryResult<T>;
    }
  });

  expect(executedQueries).toHaveLength(1);
  expect(executedQueries[0]?.text).toContain('FROM public."user" u');
  expect(executedQueries[0]?.text).toContain('LEFT JOIN public.user_bio ub');
  expect(executedQueries[0]?.text).toContain('LEFT JOIN public.user_profile_img upi');
  expect(executedQueries[0]?.text).toContain('LEFT JOIN public.user_profile_cover_img upc');
  expect(executedQueries[0]?.text).toContain('u."userTypeId" IN (1, 2, 3)');
  expect(executedQueries[0]?.text).toContain('LOWER(u.username) = LOWER($1)');
  expect(executedQueries[0]?.params).toEqual(["BUYER-1"]);
  expect(response).toEqual({
    username: "buyer-1",
    firstName: "Jane",
    lastName: "Doe",
    emailAddress: "jane.doe@example.com",
    phoneNumber: "+2348012345678",
    userTypeId: 1,
    createdAt: "2026-04-07T11:00:00.000Z",
    social_posts: {
      total: 0,
      latestCreatedAt: null
    },
    follow: {
      followers: 0,
      following: 0
    },
    user_bio: {
      bio: "Buyer bio",
      profileImage: "https://cdn.example.com/profile.jpg",
      coverImage: "https://cdn.example.com/cover.jpg"
    }
  });
});

test("getPlatformUserProfile returns null bio fields when profile rows are missing", async () => {
  const response = await getPlatformUserProfile("buyer-2", {
    queryFn: async <T extends QueryResultRow>() =>
      createQueryResult([
        {
          username: "buyer-2",
          firstName: "John",
          lastName: "Smith",
          emailAddress: "john.smith@example.com",
          phoneNumber: null,
          userTypeId: 1,
          createdAt: new Date("2026-04-06T09:30:00.000Z"),
          bio: null,
          profileImage: null,
          coverImage: null
        }
      ]) as unknown as QueryResult<T>
  });

  expect(response.user_bio).toEqual({
    bio: null,
    profileImage: null,
    coverImage: null
  });
  expect(response.social_posts).toEqual({
    total: 0,
    latestCreatedAt: null
  });
  expect(response.follow).toEqual({
    followers: 0,
    following: 0
  });
});

test("getPlatformUserProfile rejects blank, missing, or duplicate username matches", async () => {
  await expect(
    getPlatformUserProfile("   ", {
      queryFn: async <T extends QueryResultRow>() => createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow("username must be a non-empty string");

  await expect(
    getPlatformUserProfile("missing-user", {
      queryFn: async <T extends QueryResultRow>() => createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(PlatformUserProfileNotFoundError);

  await expect(
    getPlatformUserProfile("duplicate-user", {
      queryFn: async <T extends QueryResultRow>() =>
        createQueryResult([
          {
            username: "Duplicate-User",
            firstName: "Jane",
            lastName: "Doe",
            emailAddress: "jane@example.com",
            phoneNumber: "+2348012345678",
            userTypeId: 1,
            createdAt: new Date("2026-04-07T11:00:00.000Z"),
            bio: null,
            profileImage: null,
            coverImage: null
          },
          {
            username: "duplicate-user",
            firstName: "Janet",
            lastName: "Doe",
            emailAddress: "janet@example.com",
            phoneNumber: "+2348099999999",
            userTypeId: 2,
            createdAt: new Date("2026-04-06T11:00:00.000Z"),
            bio: null,
            profileImage: null,
            coverImage: null
          }
        ]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(PlatformUserProfileConflictError);
});

test("suspendPlatformUser updates the user status and writes a suspension audit log", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  const suspendedByAdmin = createAuthenticatedAdmin();

  const response = await suspendPlatformUser(
    {
      username: " Buyer-1 ",
      status: 2,
      comment: "  Repeated policy violations  ",
      suspendedByAdmin
    },
    {
      uuidFactory: () => "audit-log-id",
      nowFactory: () => new Date("2026-04-07T12:00:00.000Z"),
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            executedQueries.push({ text, params });

            if (text.includes("FOR UPDATE")) {
              return createQueryResult([
                {
                  id: 42,
                  status: 1
                }
              ]);
            }

            return createQueryResult([]);
          })
        )
    }
  );

  expect(response).toEqual({
    message: "Account successfully deactivated"
  });
  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[0]?.text).toContain('FROM public."user" u');
  expect(executedQueries[0]?.text).toContain('LOWER(u.username) = LOWER($1)');
  expect(executedQueries[0]?.params).toEqual(["Buyer-1"]);
  expect(executedQueries[1]?.text).toContain('UPDATE public."user"');
  expect(executedQueries[1]?.params).toEqual([2, new Date("2026-04-07T12:00:00.000Z"), 42]);
  expect(executedQueries[2]?.text).toContain("INSERT INTO public.user_access_audit_logs");
  expect(executedQueries[2]?.params).toEqual([
    "audit-log-id",
    42,
    suspendedByAdmin.sub,
    "suspend_account",
    1,
    2,
    "Repeated policy violations",
    new Date("2026-04-07T12:00:00.000Z")
  ]);
});

test("suspendPlatformUser rejects invalid requests and conflicting user states", async () => {
  const suspendedByAdmin = createAuthenticatedAdmin();

  await expect(
    suspendPlatformUser({
      username: "   ",
      status: 2,
      comment: "Reason",
      suspendedByAdmin
    })
  ).rejects.toThrow(PlatformUserSuspensionValidationError);

  await expect(
    suspendPlatformUser({
      username: "buyer-1",
      status: 1,
      comment: "Reason",
      suspendedByAdmin
    })
  ).rejects.toThrow("status must be 2");

  await expect(
    suspendPlatformUser({
      username: "buyer-1",
      status: 2,
      comment: "   ",
      suspendedByAdmin
    })
  ).rejects.toThrow("comment is required and must be a non-empty string");

  await expect(
    suspendPlatformUser(
      {
        username: "missing-user",
        status: 2,
        comment: "Reason",
        suspendedByAdmin
      },
      {
        runInTransaction: async (operation) =>
          operation(createTransactionClient(async () => createQueryResult([])))
      }
    )
  ).rejects.toThrow(PlatformUserSuspensionNotFoundError);

  await expect(
    suspendPlatformUser(
      {
        username: "duplicate-user",
        status: 2,
        comment: "Reason",
        suspendedByAdmin
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async () =>
              createQueryResult([
                { id: 1, status: 1 },
                { id: 2, status: 1 }
              ])
            )
          )
      }
    )
  ).rejects.toThrow(PlatformUserSuspensionConflictError);

  await expect(
    suspendPlatformUser(
      {
        username: "suspended-user",
        status: 2,
        comment: "Reason",
        suspendedByAdmin
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async () =>
              createQueryResult([
                {
                  id: 42,
                  status: 2
                }
              ])
            )
          )
      }
    )
  ).rejects.toThrow("User account is already suspended");
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

test("GET /admin/users/:username returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/users/buyer-1`);

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

test("GET /admin/users/:username returns 404 when the requested user profile does not exist", async () => {
  const application = express();

  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getPlatformUserProfileHandler: async () => {
        throw new PlatformUserProfileNotFoundError("User profile not found");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users/missing-user`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.message).toBe("User profile not found");
  } finally {
    await server.close();
  }
});

test("GET /admin/users/:username returns 409 when username lookup is ambiguous", async () => {
  const application = express();

  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getPlatformUserProfileHandler: async () => {
        throw new PlatformUserProfileConflictError(
          "Multiple users match the provided username"
        );
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users/duplicate-user`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});

test("GET /admin/users/:username validates the username path parameter", async () => {
  const application = express();

  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getPlatformUserProfileHandler: async (username) => {
        if (username.trim() === "") {
          throw new PlatformUserProfileValidationError("username must be a non-empty string");
        }

        throw new Error("This handler should not be called for non-blank usernames");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users/%20%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.message).toBe("username must be a non-empty string");
  } finally {
    await server.close();
  }
});

test("GET /admin/users/:username returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      getPlatformUserProfileHandler: async () => ({
        username: "buyer-1",
        firstName: "Jane",
        lastName: "Doe",
        emailAddress: "jane.doe@example.com",
        phoneNumber: "+2348012345678",
        userTypeId: 1,
        createdAt: "2026-04-07T11:00:00.000Z",
        social_posts: {
          total: 0,
          latestCreatedAt: null
        },
        follow: {
          followers: 0,
          following: 0
        },
        user_bio: {
          bio: "Buyer bio",
          profileImage: null,
          coverImage: null
        }
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users/buyer-1`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/users/:username returns the full user profile payload for super admins", async () => {
  const application = express();

  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getPlatformUserProfileHandler: async (username) => {
        expect(username).toBe("Buyer-1");

        return {
          username: "buyer-1",
          firstName: "Jane",
          lastName: "Doe",
          emailAddress: "jane.doe@example.com",
          phoneNumber: "+2348012345678",
          userTypeId: 1,
          createdAt: "2026-04-07T11:00:00.000Z",
          social_posts: {
            total: 0,
            latestCreatedAt: null
          },
          follow: {
            followers: 0,
            following: 0
          },
          user_bio: {
            bio: "Buyer bio",
            profileImage: "https://cdn.example.com/profile.jpg",
            coverImage: "https://cdn.example.com/cover.jpg"
          }
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users/Buyer-1`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.username).toBe("buyer-1");
    expect(payload.emailAddress).toBe("jane.doe@example.com");
    expect(payload.userTypeId).toBe(1);
    expect(payload.createdAt).toBe("2026-04-07T11:00:00.000Z");
    expect(payload.social_posts).toEqual({
      total: 0,
      latestCreatedAt: null
    });
    expect(payload.follow).toEqual({
      followers: 0,
      following: 0
    });
    expect(payload.user_bio).toEqual({
      bio: "Buyer bio",
      profileImage: "https://cdn.example.com/profile.jpg",
      coverImage: "https://cdn.example.com/cover.jpg"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/users/:username/suspend returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(express.json());
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
    const response = await fetch(`${server.baseUrl}/admin/users/buyer-1/suspend`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: 2,
        comment: "Repeated policy violations"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/users/:username/suspend returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      suspendPlatformUserHandler: async () => ({
        message: "Account successfully deactivated"
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users/buyer-1/suspend`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        status: 2,
        comment: "Repeated policy violations"
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/users/:username/suspend validates the request body and path parameter", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      suspendPlatformUserHandler: async () => ({
        message: "Account successfully deactivated"
      })
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/users/%20%20/suspend`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        status: 2,
        comment: "Repeated policy violations"
      })
    });

    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/users/buyer-1/suspend`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        status: 1,
        comment: "Repeated policy violations"
      })
    });

    expect(response.status).toBe(400);

    response = await fetch(`${server.baseUrl}/admin/users/buyer-1/suspend`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        status: 2,
        comment: "   "
      })
    });

    expect(response.status).toBe(400);
  } finally {
    await server.close();
  }
});

test("PUT /admin/users/:username/suspend maps service not-found and conflict responses", async () => {
  const notFoundApplication = express();

  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      suspendPlatformUserHandler: async () => {
        throw new PlatformUserSuspensionNotFoundError("User account not found");
      }
    })
  );

  let server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users/missing-user/suspend`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        status: 2,
        comment: "Repeated policy violations"
      })
    });

    expect(response.status).toBe(404);
  } finally {
    await server.close();
  }

  const conflictApplication = express();

  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      suspendPlatformUserHandler: async () => {
        throw new PlatformUserSuspensionConflictError("User account is already suspended");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users/suspended-user/suspend`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        status: 2,
        comment: "Repeated policy violations"
      })
    });

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});

test("PUT /admin/users/:username/suspend returns success for a valid super-admin request", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/users",
    createAdminUsersRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      suspendPlatformUserHandler: async (input) => {
        expect(input.username).toBe("Buyer-1");
        expect(input.status).toBe(2);
        expect(input.comment).toBe("Repeated policy violations");
        expect(input.suspendedByAdmin.username).toBe("brickpine-admin");

        return {
          message: "Account successfully deactivated"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/users/Buyer-1/suspend`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        status: 2,
        comment: "Repeated policy violations"
      })
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.message).toBe("Account successfully deactivated");
  } finally {
    await server.close();
  }
});
