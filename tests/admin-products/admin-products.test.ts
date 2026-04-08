import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import { createAdminProductsRouter } from "../../src/modules/admin-products/routes";
import {
  createProductCategory,
  ProductCategoryConflictError,
  ProductCategoryValidationError
} from "../../src/modules/admin-products/service";
import { CreateProductCategoryResponse } from "../../src/modules/admin-products/types";

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

test("createProductCategory inserts a trimmed product category and returns the created commission tiers", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  const timestamp = new Date("2026-04-08T15:00:00.000Z");

  const response = await createProductCategory(
    {
      name: "  Audio & Hifi  ",
      description: "  Audio devices and related products  ",
      basicCommissionVat: 15.5,
      standardCommissionVat: 14,
      premiumCommissionVat: 13
    },
    {
      nowFactory: () => timestamp,
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            executedQueries.push({ text, params });

            if (text.includes("FROM public.product_category pc")) {
              return createQueryResult([]);
            }

            return createQueryResult([
              {
                id: 7,
                name: "Audio & Hifi",
                basicCommissionVat: "15.5",
                standardCommissionVat: "14",
                premiumCommissionVat: "13"
              }
            ]);
          })
        )
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain("LOWER(BTRIM(pc.name)) = LOWER(BTRIM($1))");
  expect(executedQueries[0]?.params).toEqual(["Audio & Hifi"]);
  expect(executedQueries[1]?.text).toContain("INSERT INTO public.product_category");
  expect(executedQueries[1]?.params).toEqual([
    "Audio & Hifi",
    "Audio devices and related products",
    15.5,
    14,
    13,
    1,
    timestamp,
    timestamp
  ]);
  expect(response).toEqual({
    message: "Category created successfully",
    productCategory: {
      id: 7,
      name: "Audio & Hifi",
      basicCommissionVat: 15.5,
      standardCommissionVat: 14,
      premiumCommissionVat: 13
    }
  });
});

test("createProductCategory accepts inclusive 0 and 100 VAT boundaries", async () => {
  const response = await createProductCategory(
    {
      name: "Boundary Category",
      description: "Boundary values",
      basicCommissionVat: 0,
      standardCommissionVat: 50,
      premiumCommissionVat: 100
    },
    {
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text) => {
            if (text.includes("FROM public.product_category pc")) {
              return createQueryResult([]);
            }

            return createQueryResult([
              {
                id: 8,
                name: "Boundary Category",
                basicCommissionVat: 0,
                standardCommissionVat: 50,
                premiumCommissionVat: 100
              }
            ]);
          })
        )
    }
  );

  expect(response).toEqual({
    message: "Category created successfully",
    productCategory: {
      id: 8,
      name: "Boundary Category",
      basicCommissionVat: 0,
      standardCommissionVat: 50,
      premiumCommissionVat: 100
    }
  });
});

test("createProductCategory rejects invalid required fields and invalid VAT percentages", async () => {
  await expect(
    createProductCategory({
      name: "   ",
      description: "Audio devices",
      basicCommissionVat: 15.5,
      standardCommissionVat: 14,
      premiumCommissionVat: 13
    })
  ).rejects.toThrow(ProductCategoryValidationError);

  await expect(
    createProductCategory({
      name: "Audio & Hifi",
      description: "   ",
      basicCommissionVat: 15.5,
      standardCommissionVat: 14,
      premiumCommissionVat: 13
    })
  ).rejects.toThrow("description is required and must be a non-empty string");

  await expect(
    createProductCategory({
      name: "Audio & Hifi",
      description: "Audio devices",
      basicCommissionVat: Number.NaN,
      standardCommissionVat: 14,
      premiumCommissionVat: 13
    })
  ).rejects.toThrow("basicCommissionVat must be a finite number between 0 and 100");

  await expect(
    createProductCategory({
      name: "Audio & Hifi",
      description: "Audio devices",
      basicCommissionVat: 15.5,
      standardCommissionVat: -1,
      premiumCommissionVat: 13
    })
  ).rejects.toThrow("standardCommissionVat must be a finite number between 0 and 100");

  await expect(
    createProductCategory({
      name: "Audio & Hifi",
      description: "Audio devices",
      basicCommissionVat: 15.5,
      standardCommissionVat: 14,
      premiumCommissionVat: 101
    })
  ).rejects.toThrow("premiumCommissionVat must be a finite number between 0 and 100");

  await expect(
    createProductCategory({
      name: 42 as unknown as string,
      description: "Audio devices",
      basicCommissionVat: 15.5,
      standardCommissionVat: 14,
      premiumCommissionVat: 13
    })
  ).rejects.toThrow("name is required and must be a non-empty string");

  await expect(
    createProductCategory({
      name: "Audio & Hifi",
      description: ["Audio devices"] as unknown as string,
      basicCommissionVat: 15.5,
      standardCommissionVat: 14,
      premiumCommissionVat: 13
    })
  ).rejects.toThrow("description is required and must be a non-empty string");

  await expect(
    createProductCategory({
      name: "Audio & Hifi",
      description: "Audio devices",
      basicCommissionVat: "15.5" as unknown as number,
      standardCommissionVat: 14,
      premiumCommissionVat: 13
    })
  ).rejects.toThrow("basicCommissionVat must be a finite number between 0 and 100");

  await expect(
    createProductCategory({
      name: "Audio & Hifi",
      description: "Audio devices",
      basicCommissionVat: 15.5,
      standardCommissionVat: Infinity,
      premiumCommissionVat: 13
    })
  ).rejects.toThrow("standardCommissionVat must be a finite number between 0 and 100");
});

test("createProductCategory rejects duplicate category names and converts DB unique violations into conflicts", async () => {
  await expect(
    createProductCategory(
      {
        name: "Audio & Hifi",
        description: "Audio devices",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("FROM public.product_category pc")) {
                return createQueryResult([
                  {
                    id: 3
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow(ProductCategoryConflictError);

  await expect(
    createProductCategory(
      {
        name: "Audio & Hifi",
        description: "Audio devices",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("FROM public.product_category pc")) {
                return createQueryResult([]);
              }

              const error = {
                code: "23505"
              };

              throw error;
            })
          )
      }
    )
  ).rejects.toThrow("A product category with this name already exists");
});

test("createProductCategory throws a clear error when the insert does not return a created row", async () => {
  await expect(
    createProductCategory(
      {
        name: "Audio & Hifi",
        description: "Audio devices",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("FROM public.product_category pc")) {
                return createQueryResult([]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("Product category insert did not return a created row");
});

test("POST /admin/product/categories returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Audio & Hifi",
        description: "Audio devices and related products",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("POST /admin/product/categories returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      createProductCategoryHandler: async () => ({
        message: "Category created successfully",
        productCategory: {
          id: 7,
          name: "Audio & Hifi",
          basicCommissionVat: 15.5,
          standardCommissionVat: 14,
          premiumCommissionVat: 13
        }
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Audio & Hifi",
        description: "Audio devices and related products",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("POST /admin/product/categories validates the request body", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createProductCategoryHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "",
        description: "Audio devices and related products",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "name is required and must be a non-empty string"
    );

    response = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Audio & Hifi",
        description: "   ",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "description is required and must be a non-empty string"
    );

    response = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Audio & Hifi",
        description: "Audio devices and related products",
        basicCommissionVat: 101,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "basicCommissionVat must be a finite number between 0 and 100"
    );

    response = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Audio & Hifi",
        description: "Audio devices and related products",
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "basicCommissionVat must be a finite number between 0 and 100"
    );

    response = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Audio & Hifi",
        description: "Audio devices and related products",
        basicCommissionVat: 15.5,
        standardCommissionVat: "14",
        premiumCommissionVat: 13
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "standardCommissionVat must be a finite number between 0 and 100"
    );

    response = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Audio & Hifi",
        description: "Audio devices and related products",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: null
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "premiumCommissionVat must be a finite number between 0 and 100"
    );
  } finally {
    await server.close();
  }
});

test("POST /admin/product/categories maps service conflicts and returns 201 on success", async () => {
  let server;
  const conflictApplication = express();

  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createProductCategoryHandler: async () => {
        throw new ProductCategoryConflictError("A product category with this name already exists");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const conflictResponse = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Audio & Hifi",
        description: "Audio devices and related products",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      })
    });

    expect(conflictResponse.status).toBe(409);
  } finally {
    await server.close();
  }

  const successApplication = express();

  successApplication.use(express.json());
  successApplication.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createProductCategoryHandler: async (input): Promise<CreateProductCategoryResponse> => {
        expect(input).toEqual({
          name: "Audio & Hifi",
          description: "Audio devices and related products",
          basicCommissionVat: 15.5,
          standardCommissionVat: 14,
          premiumCommissionVat: 13
        });

        return {
          message: "Category created successfully",
          productCategory: {
            id: 7,
            name: "Audio & Hifi",
            basicCommissionVat: 15.5,
            standardCommissionVat: 14,
            premiumCommissionVat: 13
          }
        };
      }
    })
  );

  server = await startTestServer(successApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Audio & Hifi",
        description: "Audio devices and related products",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      })
    });

    expect(response.status).toBe(201);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toEqual({
      message: "Category created successfully",
      productCategory: {
        id: 7,
        name: "Audio & Hifi",
        basicCommissionVat: 15.5,
        standardCommissionVat: 14,
        premiumCommissionVat: 13
      }
    });
  } finally {
    await server.close();
  }
});

test("POST /admin/product/categories accepts inclusive 0 and 100 commission VAT values", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      createProductCategoryHandler: async (input): Promise<CreateProductCategoryResponse> => {
        expect(input).toEqual({
          name: "Boundary Category",
          description: "Boundary values",
          basicCommissionVat: 0,
          standardCommissionVat: 50,
          premiumCommissionVat: 100
        });

        return {
          message: "Category created successfully",
          productCategory: {
            id: 8,
            name: "Boundary Category",
            basicCommissionVat: 0,
            standardCommissionVat: 50,
            premiumCommissionVat: 100
          }
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Boundary Category",
        description: "Boundary values",
        basicCommissionVat: 0,
        standardCommissionVat: 50,
        premiumCommissionVat: 100
      })
    });

    expect(response.status).toBe(201);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toEqual({
      message: "Category created successfully",
      productCategory: {
        id: 8,
        name: "Boundary Category",
        basicCommissionVat: 0,
        standardCommissionVat: 50,
        premiumCommissionVat: 100
      }
    });
  } finally {
    await server.close();
  }
});
