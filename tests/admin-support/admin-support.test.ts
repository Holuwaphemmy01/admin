import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminSupportRouter } from "../../src/modules/admin-support/routes";
import {
  AdminSupportTicketNotFoundError,
  AdminSupportTicketsValidationError,
  getAdminSupportTicketDetails,
  listAdminSupportTickets,
  replyToAdminSupportTicket
} from "../../src/modules/admin-support/service";
import {
  AdminSupportTicketDetailsResponse,
  AdminSupportTicketsListResponse,
  ReplyToAdminSupportTicketResponse
} from "../../src/modules/admin-support/types";

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

test("getAdminSupportTicketDetails returns a reconstructed ticket thread for the requested ticket id", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await getAdminSupportTicketDetails(2, {
    queryFn: async <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> => {
      executedQueries.push({ text, params });

      if (executedQueries.length === 1) {
        return createQueryResult([
          {
            id: 2,
            userId: 3,
            username: "mendes",
            subject: null,
            message: "Still waiting for my payment",
            attachment: "https://cdn.example.com/ticket-2.png",
            attachmentFileType: "image/png",
            reply: true,
            status: 1,
            createdAt: new Date("2025-10-30T15:00:04.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }

      if (executedQueries.length === 2) {
        return createQueryResult([
          {
            id: 1,
            userId: 3,
            username: "mendes",
            subject: "Payment not processed",
            message: "Still waiting for my payment",
            attachment: "https://cdn.example.com/ticket-1.png",
            attachmentFileType: "image/png",
            reply: false,
            status: 1,
            createdAt: new Date("2025-10-30T14:58:53.000Z")
          },
          {
            id: 2,
            userId: 3,
            username: "mendes",
            subject: null,
            message: "Still waiting for my payment",
            attachment: "https://cdn.example.com/ticket-2.png",
            attachmentFileType: "image/png",
            reply: true,
            status: 1,
            createdAt: new Date("2025-10-30T15:00:04.000Z")
          },
          {
            id: 3,
            userId: 3,
            username: "mendes",
            subject: "Payment not processed",
            message: "Any update on this issue?",
            attachment: null,
            attachmentFileType: null,
            reply: false,
            status: 1,
            createdAt: new Date("2025-10-30T15:00:23.000Z")
          },
          {
            id: 4,
            userId: 3,
            username: "mendes",
            subject: "Different issue",
            message: "This should not be part of the same thread",
            attachment: null,
            attachmentFileType: null,
            reply: false,
            status: 2,
            createdAt: new Date("2025-10-31T09:00:00.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }

      throw new Error(`Unexpected query: ${text}`);
    }
  });

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("WHERE st.id = $1");
  expect(executedQueries[0]?.params).toEqual([2]);
  expect(executedQueries[1]?.text).toContain('WHERE st."userId" = $1');
  expect(executedQueries[1]?.params).toEqual([3]);
  expect(response).toEqual({
    ticket: {
      id: 2,
      username: "mendes",
      subject: "Payment not processed",
      messages: [
        {
          id: 1,
          message: "Still waiting for my payment",
          attachment: "https://cdn.example.com/ticket-1.png",
          attachmentFileType: "image/png",
          reply: false,
          createdAt: "2025-10-30T14:58:53.000Z"
        },
        {
          id: 2,
          message: "Still waiting for my payment",
          attachment: "https://cdn.example.com/ticket-2.png",
          attachmentFileType: "image/png",
          reply: true,
          createdAt: "2025-10-30T15:00:04.000Z"
        },
        {
          id: 3,
          message: "Any update on this issue?",
          attachment: null,
          attachmentFileType: null,
          reply: false,
          createdAt: "2025-10-30T15:00:23.000Z"
        }
      ],
      status: "open",
      createdAt: "2025-10-30T15:00:04.000Z"
    }
  });
});

test("getAdminSupportTicketDetails validates the id and maps missing tickets", async () => {
  await expect(getAdminSupportTicketDetails(0)).rejects.toThrow(
    AdminSupportTicketsValidationError
  );

  await expect(
    getAdminSupportTicketDetails(404, {
      queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
        createQueryResult([]) as unknown as QueryResult<T>
    })
  ).rejects.toThrow(AdminSupportTicketNotFoundError);
});

test("replyToAdminSupportTicket inserts an admin reply and returns null signed params when no attachment upload is requested", async () => {
  const fixedNow = new Date("2026-04-10T09:30:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await replyToAdminSupportTicket(
    {
      ticketId: 3,
      message: " We are checking this for you "
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
              id: 3,
              userId: 7,
              ticketCategoryId: 4,
              username: "mendes",
              owner: "mendes",
              subject: "Payment not processed",
              message: "Still waiting for my payment",
              attachment: null,
              attachmentFileType: null,
              reply: false,
              status: 1,
              createdAt: new Date("2026-04-10T08:45:00.000Z")
            }
          ]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 2) {
          return createQueryResult([
            {
              id: 3,
              userId: 7,
              ticketCategoryId: 4,
              username: "mendes",
              owner: "mendes",
              subject: "Payment not processed",
              message: "Still waiting for my payment",
              attachment: null,
              attachmentFileType: null,
              reply: false,
              status: 1,
              createdAt: new Date("2026-04-10T08:45:00.000Z")
            },
            {
              id: 4,
              userId: 7,
              ticketCategoryId: 4,
              username: "mendes",
              owner: "mendes",
              subject: null,
              message: "Can someone help?",
              attachment: null,
              attachmentFileType: null,
              reply: true,
              status: 1,
              createdAt: new Date("2026-04-10T09:00:00.000Z")
            }
          ]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 3) {
          return createQueryResult([
            {
              id: 12
            }
          ]) as unknown as QueryResult<T>;
        }

        throw new Error(`Unexpected query: ${text}`);
      }
    }
  );

  expect(response).toEqual({
    signedParams: null
  });
  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[0]?.text).toContain("WHERE st.id = $1");
  expect(executedQueries[0]?.params).toEqual([3]);
  expect(executedQueries[1]?.text).toContain('WHERE st."userId" = $1');
  expect(executedQueries[1]?.params).toEqual([7]);
  expect(executedQueries[2]?.text).toContain("INSERT INTO public.support_ticket");
  expect(executedQueries[2]?.params).toEqual([
    7,
    4,
    "Payment not processed",
    "We are checking this for you",
    null,
    null,
    "mendes",
    true,
    1,
    fixedNow,
    fixedNow
  ]);
});

test("replyToAdminSupportTicket returns signed params and falls back to owner-based thread lookup when userId is unavailable", async () => {
  const fixedNow = new Date("2026-04-10T10:15:00.000Z");
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await replyToAdminSupportTicket(
    {
      ticketId: 5,
      message: " Please see the attached screenshot ",
      attachmentFileType: " image/png "
    },
    {
      nowFactory: () => fixedNow,
      uuidFactory: () => "reply-file-id",
      createReplySignedParams: ({ attachmentFileType, attachmentKey, ticketId }) => {
        expect({ attachmentFileType, attachmentKey, ticketId }).toEqual({
          attachmentFileType: "image/png",
          attachmentKey: "support/tickets/5/replies/reply-file-id",
          ticketId: 5
        });

        return {
          url: "https://uploads.example.com/support",
          fields: {
            key: attachmentKey,
            "Content-Type": attachmentFileType
          }
        };
      },
      queryFn: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => {
        executedQueries.push({ text, params });

        if (executedQueries.length === 1) {
          return createQueryResult([
            {
              id: 5,
              userId: null,
              ticketCategoryId: 2,
              username: "owner-fallback",
              owner: "owner-fallback",
              subject: null,
              message: "I need help with my refund",
              attachment: null,
              attachmentFileType: null,
              reply: true,
              status: 2,
              createdAt: new Date("2026-04-10T09:30:00.000Z")
            }
          ]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 2) {
          return createQueryResult([
            {
              id: 1,
              userId: null,
              ticketCategoryId: 2,
              username: "owner-fallback",
              owner: "owner-fallback",
              subject: "Need help with refund",
              message: "I need help with my refund",
              attachment: null,
              attachmentFileType: null,
              reply: false,
              status: 2,
              createdAt: new Date("2026-04-10T08:00:00.000Z")
            },
            {
              id: 5,
              userId: null,
              ticketCategoryId: 2,
              username: "owner-fallback",
              owner: "owner-fallback",
              subject: null,
              message: "I need help with my refund",
              attachment: null,
              attachmentFileType: null,
              reply: true,
              status: 2,
              createdAt: new Date("2026-04-10T09:30:00.000Z")
            }
          ]) as unknown as QueryResult<T>;
        }

        if (executedQueries.length === 3) {
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
    signedParams: {
      url: "https://uploads.example.com/support",
      fields: {
        key: "support/tickets/5/replies/reply-file-id",
        "Content-Type": "image/png"
      }
    }
  });
  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[1]?.text).toContain("WHERE LOWER(BTRIM(st.owner)) = LOWER($1)");
  expect(executedQueries[1]?.params).toEqual(["owner-fallback"]);
  expect(executedQueries[2]?.params).toEqual([
    null,
    2,
    "Need help with refund",
    "Please see the attached screenshot",
    "support/tickets/5/replies/reply-file-id",
    "image/png",
    "owner-fallback",
    true,
    2,
    fixedNow,
    fixedNow
  ]);
});

test("replyToAdminSupportTicket validates the payload and maps missing tickets", async () => {
  await expect(
    replyToAdminSupportTicket({
      ticketId: 0,
      message: "We are checking this"
    })
  ).rejects.toThrow(AdminSupportTicketsValidationError);

  await expect(
    replyToAdminSupportTicket({
      ticketId: 3,
      message: "   "
    })
  ).rejects.toThrow(AdminSupportTicketsValidationError);

  await expect(
    replyToAdminSupportTicket({
      ticketId: 3,
      message: "We are checking this",
      attachmentFileType: "   "
    })
  ).rejects.toThrow(AdminSupportTicketsValidationError);

  await expect(
    replyToAdminSupportTicket(
      {
        ticketId: 404,
        message: "We are checking this"
      },
      {
        queryFn: async <T extends QueryResultRow = QueryResultRow>() =>
          createQueryResult([]) as unknown as QueryResult<T>
      }
    )
  ).rejects.toThrow(AdminSupportTicketNotFoundError);
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

test("GET /admin/support/tickets/:ticketId returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/support/tickets/3`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/support/tickets/:ticketId returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      getAdminSupportTicketDetailsHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/support/tickets/3`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/support/tickets/:ticketId validates the ticket identifier and maps missing tickets", async () => {
  let server;
  const validationApplication = express();

  validationApplication.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getAdminSupportTicketDetailsHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  server = await startTestServer(validationApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/support/tickets/abc`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "ticketId must be a positive integer"
    });
  } finally {
    await server.close();
  }

  const notFoundApplication = express();

  notFoundApplication.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getAdminSupportTicketDetailsHandler: async () => {
        throw new AdminSupportTicketNotFoundError("Support ticket not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/support/tickets/999`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Support ticket not found"
    });
  } finally {
    await server.close();
  }
});

test("GET /admin/support/tickets/:ticketId returns the ticket details payload", async () => {
  const application = express();

  application.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      getAdminSupportTicketDetailsHandler: async (
        ticketId
      ): Promise<AdminSupportTicketDetailsResponse> => {
        expect(ticketId).toBe(3);

        return {
          ticket: {
            id: 3,
            username: "mendes",
            subject: "Payment not processed",
            messages: [
              {
                id: 1,
                message: "Still waiting for my payment",
                attachment: "https://cdn.example.com/ticket-1.png",
                attachmentFileType: "image/png",
                reply: false,
                createdAt: "2025-10-30T14:58:53.000Z"
              },
              {
                id: 2,
                message: "We are checking this for you",
                attachment: null,
                attachmentFileType: null,
                reply: true,
                createdAt: "2025-10-30T15:00:04.000Z"
              }
            ],
            status: "open",
            createdAt: "2025-10-30T15:00:23.000Z"
          }
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/support/tickets/%203%20`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      ticket: {
        id: 3,
        username: "mendes",
        subject: "Payment not processed",
        messages: [
          {
            id: 1,
            message: "Still waiting for my payment",
            attachment: "https://cdn.example.com/ticket-1.png",
            attachmentFileType: "image/png",
            reply: false,
            createdAt: "2025-10-30T14:58:53.000Z"
          },
          {
            id: 2,
            message: "We are checking this for you",
            attachment: null,
            attachmentFileType: null,
            reply: true,
            createdAt: "2025-10-30T15:00:04.000Z"
          }
        ],
        status: "open",
        createdAt: "2025-10-30T15:00:23.000Z"
      }
    });
  } finally {
    await server.close();
  }
});

test("POST /admin/support/tickets/:ticketId/reply returns 401 when the admin token is missing", async () => {
  const application = express();
  application.use(express.json());

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
    const response = await fetch(`${server.baseUrl}/admin/support/tickets/3/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticketId: 3,
        message: "We are checking this"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("POST /admin/support/tickets/:ticketId/reply returns 403 for non-super-admins", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      replyToAdminSupportTicketHandler: async () => {
        throw new Error("This handler should not be called when access is forbidden");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/support/tickets/3/reply`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticketId: 3,
        message: "We are checking this"
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("POST /admin/support/tickets/:ticketId/reply validates the path and request body, and maps missing tickets", async () => {
  let server;
  const validationApplication = express();
  validationApplication.use(express.json());

  validationApplication.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      replyToAdminSupportTicketHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  server = await startTestServer(validationApplication);

  try {
    let response = await fetch(`${server.baseUrl}/admin/support/tickets/abc/reply`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticketId: 3,
        message: "We are checking this"
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "ticketId must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/support/tickets/3/reply`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "We are checking this"
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "ticketId is required and must be a positive integer"
    });

    response = await fetch(`${server.baseUrl}/admin/support/tickets/3/reply`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticketId: 4,
        message: "We are checking this"
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "ticketId in request body must match the path ticketId"
    });

    response = await fetch(`${server.baseUrl}/admin/support/tickets/3/reply`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticketId: 3,
        message: "   "
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "message is required and must be a non-empty string"
    });

    response = await fetch(`${server.baseUrl}/admin/support/tickets/3/reply`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticketId: 3,
        message: "We are checking this",
        attachmentFileType: "   "
      })
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "attachmentFileType must be a non-empty string when provided"
    });
  } finally {
    await server.close();
  }

  const notFoundApplication = express();
  notFoundApplication.use(express.json());

  notFoundApplication.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      replyToAdminSupportTicketHandler: async () => {
        throw new AdminSupportTicketNotFoundError("Support ticket not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/support/tickets/3/reply`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticketId: 3,
        message: "We are checking this"
      })
    });

    expect(response.status).toBe(404);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Support ticket not found"
    });
  } finally {
    await server.close();
  }
});

test("POST /admin/support/tickets/:ticketId/reply returns signed params and passes trimmed values", async () => {
  const application = express();
  application.use(express.json());

  application.use(
    "/admin/support",
    createAdminSupportRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      replyToAdminSupportTicketHandler: async (
        payload
      ): Promise<ReplyToAdminSupportTicketResponse> => {
        expect(payload).toEqual({
          ticketId: 3,
          message: "Please see the attached screenshot",
          attachmentFileType: "image/png"
        });

        return {
          signedParams: {
            url: "https://uploads.example.com/support",
            fields: {
              key: "support/tickets/3/replies/reply-file-id",
              "Content-Type": "image/png"
            }
          }
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/support/tickets/%203%20/reply`, {
      method: "POST",
      headers: {
        Authorization: "Bearer any-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticketId: " 3 ",
        message: " Please see the attached screenshot ",
        attachmentFileType: " image/png "
      })
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      signedParams: {
        url: "https://uploads.example.com/support",
        fields: {
          key: "support/tickets/3/replies/reply-file-id",
          "Content-Type": "image/png"
        }
      }
    });
  } finally {
    await server.close();
  }
});
