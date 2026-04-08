import { AddressInfo } from "node:net";

import { expect, test } from "@jest/globals";
import express, { RequestHandler } from "express";
import { QueryResult, QueryResultRow } from "pg";

import { createAuthenticateAdminMiddleware } from "../../src/modules/admin-auth/middleware";
import { AuthenticatedAdmin } from "../../src/modules/admin-auth/types";
import {
  createAdminProductsCollectionRouter,
  createAdminProductsRouter
} from "../../src/modules/admin-products/routes";
import {
  createProductCategory,
  deleteProductCategory,
  listProducts,
  moderateProduct,
  ProductCategoryConflictError,
  ProductCategoryNotFoundError,
  ProductCategoryValidationError,
  ProductListValidationError,
  ProductModerationConflictError,
  ProductModerationValidationError,
  ProductNotFoundError,
  updateProductCategory
} from "../../src/modules/admin-products/service";
import {
  AdminProductsListResponse,
  CreateProductCategoryResponse,
  DeleteProductCategoryResponse,
  ModerateProductResponse,
  UpdateProductCategoryResponse
} from "../../src/modules/admin-products/types";

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

test("updateProductCategory updates only provided fields and preserves existing values", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  const timestamp = new Date("2026-04-08T16:00:00.000Z");

  const response = await updateProductCategory(
    {
      id: 7,
      name: "  Updated Audio & Hifi  ",
      standardCommissionVat: 13.5
    },
    {
      nowFactory: () => timestamp,
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            executedQueries.push({ text, params });

            if (text.includes("WHERE pc.id = $1") && text.includes("FOR UPDATE")) {
              return createQueryResult([
                {
                  id: 7,
                  name: "Audio & Hifi",
                  description: "Audio devices and related products",
                  basicCommissionVat: "15.5",
                  standardCommissionVat: "14",
                  premiumCommissionVat: "13"
                }
              ]);
            }

            if (text.includes("AND pc.id <> $2")) {
              return createQueryResult([]);
            }

            return createQueryResult([
              {
                id: 7,
                name: "Updated Audio & Hifi",
                description: "Audio devices and related products",
                basicCommissionVat: "15.5",
                standardCommissionVat: "13.5",
                premiumCommissionVat: "13"
              }
            ]);
          })
        )
    }
  );

  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[0]?.text).toContain("FOR UPDATE");
  expect(executedQueries[0]?.params).toEqual([7]);
  expect(executedQueries[1]?.text).toContain("AND pc.id <> $2");
  expect(executedQueries[1]?.params).toEqual(["Updated Audio & Hifi", 7]);
  expect(executedQueries[2]?.text).toContain("UPDATE public.product_category");
  expect(executedQueries[2]?.params).toEqual([
    "Updated Audio & Hifi",
    "Audio devices and related products",
    "15.5",
    13.5,
    "13",
    timestamp,
    7
  ]);
  expect(response).toEqual({
    message: "Category updated successfully",
    productCategory: {
      id: 7,
      name: "Updated Audio & Hifi",
      description: "Audio devices and related products",
      basicCommissionVat: 15.5,
      standardCommissionVat: 13.5,
      premiumCommissionVat: 13
    }
  });
});

test("updateProductCategory handles legacy null category values and accepts partial description-only updates", async () => {
  const response = await updateProductCategory(
    {
      id: 1,
      description: "  Fashion and lifestyle products  "
    },
    {
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text) => {
            if (text.includes("WHERE pc.id = $1") && text.includes("FOR UPDATE")) {
              return createQueryResult([
                {
                  id: 1,
                  name: "Fashion",
                  description: null,
                  basicCommissionVat: null,
                  standardCommissionVat: null,
                  premiumCommissionVat: null
                }
              ]);
            }

            return createQueryResult([
              {
                id: 1,
                name: "Fashion",
                description: "Fashion and lifestyle products",
                basicCommissionVat: null,
                standardCommissionVat: null,
                premiumCommissionVat: null
              }
            ]);
          })
        )
    }
  );

  expect(response).toEqual({
    message: "Category updated successfully",
    productCategory: {
      id: 1,
      name: "Fashion",
      description: "Fashion and lifestyle products",
      basicCommissionVat: null,
      standardCommissionVat: null,
      premiumCommissionVat: null
    }
  });
});

test("updateProductCategory rejects invalid ids, empty updates, invalid optional fields, missing categories, and duplicate names", async () => {
  await expect(
    updateProductCategory({
      id: 0,
      name: "Audio & Hifi"
    })
  ).rejects.toThrow(ProductCategoryValidationError);

  await expect(
    updateProductCategory({
      id: 7
    })
  ).rejects.toThrow("At least one category field must be provided for update");

  await expect(
    updateProductCategory({
      id: 7,
      description: "   "
    })
  ).rejects.toThrow("description is required and must be a non-empty string");

  await expect(
    updateProductCategory({
      id: 7,
      premiumCommissionVat: "13" as unknown as number
    })
  ).rejects.toThrow("premiumCommissionVat must be a finite number between 0 and 100");

  await expect(
    updateProductCategory(
      {
        id: 999,
        name: "Audio & Hifi"
      },
      {
        runInTransaction: async (operation) =>
          operation(createTransactionClient(async () => createQueryResult([])))
      }
    )
  ).rejects.toThrow(ProductCategoryNotFoundError);

  await expect(
    updateProductCategory(
      {
        id: 7,
        name: "Audio & Hifi"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("WHERE pc.id = $1") && text.includes("FOR UPDATE")) {
                return createQueryResult([
                  {
                    id: 7,
                    name: "Cameras",
                    description: "Camera products",
                    basicCommissionVat: "12.5",
                    standardCommissionVat: "11.5",
                    premiumCommissionVat: "10"
                  }
                ]);
              }

              if (text.includes("AND pc.id <> $2")) {
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
});

test("updateProductCategory converts DB unique violations and empty update returns into clear errors", async () => {
  await expect(
    updateProductCategory(
      {
        id: 7,
        name: "Audio & Hifi"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("WHERE pc.id = $1") && text.includes("FOR UPDATE")) {
                return createQueryResult([
                  {
                    id: 7,
                    name: "Old Audio",
                    description: "Audio devices",
                    basicCommissionVat: "15.5",
                    standardCommissionVat: "14",
                    premiumCommissionVat: "13"
                  }
                ]);
              }

              if (text.includes("AND pc.id <> $2")) {
                return createQueryResult([]);
              }

              throw {
                code: "23505"
              };
            })
          )
      }
    )
  ).rejects.toThrow("A product category with this name already exists");

  await expect(
    updateProductCategory(
      {
        id: 7,
        name: "Updated Audio"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("WHERE pc.id = $1") && text.includes("FOR UPDATE")) {
                return createQueryResult([
                  {
                    id: 7,
                    name: "Audio & Hifi",
                    description: "Audio devices",
                    basicCommissionVat: "15.5",
                    standardCommissionVat: "14",
                    premiumCommissionVat: "13"
                  }
                ]);
              }

              if (text.includes("AND pc.id <> $2")) {
                return createQueryResult([]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("Product category update did not return an updated row");
});

test("deleteProductCategory deletes a product category when no linked products or category commissions exist", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await deleteProductCategory(
    {
      id: 7
    },
    {
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            executedQueries.push({ text, params });

            if (text.includes("WHERE pc.id = $1") && text.includes("FOR UPDATE")) {
              return createQueryResult([
                {
                  id: 7
                }
              ]);
            }

            if (text.includes('FROM public.product p WHERE p."productCategoryId" = $1')) {
              return createQueryResult([
                {
                  productCount: "0",
                  productCategoryCommissionCount: "0"
                }
              ]);
            }

            return createQueryResult([
              {
                id: 7
              }
            ]);
          })
        )
    }
  );

  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[0]?.text).toContain("FOR UPDATE");
  expect(executedQueries[0]?.params).toEqual([7]);
  expect(executedQueries[1]?.text).toContain('FROM public.product p WHERE p."productCategoryId" = $1');
  expect(executedQueries[1]?.text).toContain(
    'FROM public.product_category_commission pcc WHERE pcc."productCategoryId" = $1'
  );
  expect(executedQueries[1]?.params).toEqual([7]);
  expect(executedQueries[2]?.text).toContain("DELETE FROM public.product_category");
  expect(executedQueries[2]?.params).toEqual([7]);
  expect(response).toEqual({
    message: "Category deleted successfully"
  });
});

test("deleteProductCategory rejects invalid ids, missing categories, linked rows, and empty delete returns", async () => {
  await expect(
    deleteProductCategory({
      id: 0
    })
  ).rejects.toThrow(ProductCategoryValidationError);

  await expect(
    deleteProductCategory(
      {
        id: 999
      },
      {
        runInTransaction: async (operation) =>
          operation(createTransactionClient(async () => createQueryResult([])))
      }
    )
  ).rejects.toThrow(ProductCategoryNotFoundError);

  await expect(
    deleteProductCategory(
      {
        id: 7
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("WHERE pc.id = $1") && text.includes("FOR UPDATE")) {
                return createQueryResult([
                  {
                    id: 7
                  }
                ]);
              }

              if (text.includes('FROM public.product p WHERE p."productCategoryId" = $1')) {
                return createQueryResult([
                  {
                    productCount: "2",
                    productCategoryCommissionCount: "0"
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow(
    "Product category cannot be deleted while linked products or category commissions exist"
  );

  await expect(
    deleteProductCategory(
      {
        id: 7
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("WHERE pc.id = $1") && text.includes("FOR UPDATE")) {
                return createQueryResult([
                  {
                    id: 7
                  }
                ]);
              }

              if (text.includes('FROM public.product p WHERE p."productCategoryId" = $1')) {
                return createQueryResult([
                  {
                    productCount: "0",
                    productCategoryCommissionCount: "3"
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow(
    "Product category cannot be deleted while linked products or category commissions exist"
  );

  await expect(
    deleteProductCategory(
      {
        id: 7
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async (text) => {
              if (text.includes("WHERE pc.id = $1") && text.includes("FOR UPDATE")) {
                return createQueryResult([
                  {
                    id: 7
                  }
                ]);
              }

              if (text.includes('FROM public.product p WHERE p."productCategoryId" = $1')) {
                return createQueryResult([
                  {
                    productCount: "0",
                    productCategoryCommissionCount: "0"
                  }
                ]);
              }

              return createQueryResult([]);
            })
          )
      }
    )
  ).rejects.toThrow("Product category delete did not return a deleted row");
});

test("moderateProduct flags a product and records an audit log without hiding it", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];
  const timestamp = new Date("2026-04-08T18:00:00.000Z");

  const response = await moderateProduct(
    {
      productId: 65,
      reason: "  Counterfeit product listing  ",
      action: "flag",
      actedByAdminUserId: "admin-user-id"
    },
    {
      nowFactory: () => timestamp,
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            executedQueries.push({ text, params });

            if (text.includes("FROM public.product p") && text.includes("FOR UPDATE")) {
              return createQueryResult([
                {
                  id: 65,
                  showProduct: true,
                  policyAction: null,
                  removedByPolicy: false
                }
              ]);
            }

            if (text.includes("UPDATE public.product")) {
              return createQueryResult([
                {
                  id: 65
                }
              ]);
            }

            return createQueryResult([
              {
                id: "audit-row-id"
              }
            ]);
          })
        )
    }
  );

  expect(executedQueries).toHaveLength(3);
  expect(executedQueries[0]?.params).toEqual([65]);
  expect(executedQueries[1]?.text).toContain("UPDATE public.product");
  expect(executedQueries[1]?.params).toEqual([
    "flag",
    "Counterfeit product listing",
    timestamp,
    "admin-user-id",
    false,
    true,
    timestamp,
    65
  ]);
  expect(executedQueries[2]?.text).toContain("INSERT INTO public.product_policy_action_audit_logs");
  expect(executedQueries[2]?.params?.slice(1)).toEqual([
    65,
    "admin-user-id",
    "flag",
    "Counterfeit product listing",
    null,
    true,
    true,
    timestamp
  ]);
  expect(response).toEqual({
    message: "Product flagged successfully",
    productId: 65
  });
});

test("moderateProduct soft-removes a product by hiding it and recording an audit log", async () => {
  const timestamp = new Date("2026-04-08T18:30:00.000Z");
  const response = await moderateProduct(
    {
      productId: 64,
      reason: "Policy-violating item",
      action: "remove",
      actedByAdminUserId: "admin-user-id"
    },
    {
      nowFactory: () => timestamp,
      runInTransaction: async (operation) =>
        operation(
          createTransactionClient(async (text, params) => {
            if (text.includes("FROM public.product p") && text.includes("FOR UPDATE")) {
              return createQueryResult([
                {
                  id: 64,
                  showProduct: true,
                  policyAction: "flag",
                  removedByPolicy: false
                }
              ]);
            }

            if (text.includes("UPDATE public.product")) {
              expect(params).toEqual([
                "remove",
                "Policy-violating item",
                timestamp,
                "admin-user-id",
                true,
                false,
                timestamp,
                64
              ]);

              return createQueryResult([
                {
                  id: 64
                }
              ]);
            }

            return createQueryResult([
              {
                id: "audit-row-id"
              }
            ]);
          })
        )
    }
  );

  expect(response).toEqual({
    message: "Product removed successfully",
    productId: 64
  });
});

test("moderateProduct rejects invalid moderation input and moderation conflicts", async () => {
  await expect(
    moderateProduct({
      productId: 0,
      reason: "Bad listing",
      action: "flag",
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow(ProductModerationValidationError);

  await expect(
    moderateProduct({
      productId: 1,
      reason: "   ",
      action: "flag",
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow("reason is required and must be a non-empty string");

  await expect(
    moderateProduct({
      productId: 1,
      reason: "Bad listing",
      action: "archive" as "flag",
      actedByAdminUserId: "admin-user-id"
    })
  ).rejects.toThrow("action must be either 'flag' or 'remove'");

  await expect(
    moderateProduct({
      productId: 1,
      reason: "Bad listing",
      action: "flag",
      actedByAdminUserId: "   "
    })
  ).rejects.toThrow("actedByAdminUserId is required and must be a non-empty string");

  await expect(
    moderateProduct(
      {
        productId: 999,
        reason: "Bad listing",
        action: "flag",
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(createTransactionClient(async () => createQueryResult([])))
      }
    )
  ).rejects.toThrow(ProductNotFoundError);

  await expect(
    moderateProduct(
      {
        productId: 65,
        reason: "Bad listing",
        action: "flag",
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async () =>
              createQueryResult([
                {
                  id: 65,
                  showProduct: true,
                  policyAction: "flag",
                  removedByPolicy: false
                }
              ])
            )
          )
      }
    )
  ).rejects.toThrow("Product is already flagged");

  await expect(
    moderateProduct(
      {
        productId: 65,
        reason: "Bad listing",
        action: "remove",
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async () =>
              createQueryResult([
                {
                  id: 65,
                  showProduct: false,
                  policyAction: "remove",
                  removedByPolicy: true
                }
              ])
            )
          )
      }
    )
  ).rejects.toThrow("Product is already removed");

  await expect(
    moderateProduct(
      {
        productId: 65,
        reason: "Bad listing",
        action: "flag",
        actedByAdminUserId: "admin-user-id"
      },
      {
        runInTransaction: async (operation) =>
          operation(
            createTransactionClient(async () =>
              createQueryResult([
                {
                  id: 65,
                  showProduct: false,
                  policyAction: "remove",
                  removedByPolicy: true
                }
              ])
            )
          )
      }
    )
  ).rejects.toThrow("Product has already been removed and cannot be flagged");
});

test("listProducts maps product rows, computes statuses, and returns the total count", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  const response = await listProducts(
    {
      page: 1,
      limit: 20
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
              total: 4
            }
          ]) as unknown as QueryResult<T>;
        }

        return createQueryResult([
          {
            id: 65,
            name: "Sandwich Maker",
            sellerUsername: "seller-one",
            categoryId: "7",
            categoryName: "Home Appliances",
            price: 25000,
            currency: "NGN",
            quantity: 12,
            showProduct: true,
            policyAction: null,
            removedByPolicy: false,
            createdAt: new Date("2026-04-08T12:00:00.000Z")
          },
          {
            id: 64,
            name: "Counterfeit Headset",
            sellerUsername: "seller-two",
            categoryId: "8",
            categoryName: "Audio & Hifi",
            price: "10000",
            currency: "NGN",
            quantity: "8",
            showProduct: true,
            policyAction: "flag",
            removedByPolicy: false,
            createdAt: new Date("2026-04-07T12:00:00.000Z")
          },
          {
            id: 63,
            name: "Mini Fan",
            sellerUsername: "seller-three",
            categoryId: null,
            categoryName: null,
            price: "5000",
            currency: "NGN",
            quantity: "0",
            showProduct: true,
            policyAction: null,
            removedByPolicy: false,
            createdAt: new Date("2026-04-06T12:00:00.000Z")
          },
          {
            id: 62,
            name: "Removed Item",
            sellerUsername: "seller-four",
            categoryId: "9",
            categoryName: "Electronics",
            price: null,
            currency: null,
            quantity: null,
            showProduct: false,
            policyAction: "remove",
            removedByPolicy: true,
            createdAt: new Date("2026-04-05T12:00:00.000Z")
          }
        ]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries).toHaveLength(2);
  expect(executedQueries[0]?.text).toContain('LEFT JOIN public."user" u ON u.id = p."userId"');
  expect(executedQueries[0]?.text).toContain("ORDER BY p.\"createdAt\" DESC, p.id DESC");
  expect(executedQueries[0]?.params).toEqual([20, 0]);
  expect(executedQueries[1]?.text).toContain("COUNT(*)::int AS total");
  expect(response).toEqual({
    products: [
      {
        id: 65,
        name: "Sandwich Maker",
        sellerUsername: "seller-one",
        categoryId: 7,
        categoryName: "Home Appliances",
        price: 25000,
        currency: "NGN",
        quantity: 12,
        status: "active",
        createdAt: "2026-04-08T12:00:00.000Z"
      },
      {
        id: 64,
        name: "Counterfeit Headset",
        sellerUsername: "seller-two",
        categoryId: 8,
        categoryName: "Audio & Hifi",
        price: 10000,
        currency: "NGN",
        quantity: 8,
        status: "flagged",
        createdAt: "2026-04-07T12:00:00.000Z"
      },
      {
        id: 63,
        name: "Mini Fan",
        sellerUsername: "seller-three",
        categoryId: null,
        categoryName: null,
        price: 5000,
        currency: "NGN",
        quantity: 0,
        status: "out_of_stock",
        createdAt: "2026-04-06T12:00:00.000Z"
      },
      {
        id: 62,
        name: "Removed Item",
        sellerUsername: "seller-four",
        categoryId: 9,
        categoryName: "Electronics",
        price: null,
        currency: null,
        quantity: null,
        status: "removed",
        createdAt: "2026-04-05T12:00:00.000Z"
      }
    ],
    total: 4
  });
});

test("listProducts applies filters and rejects invalid filter values", async () => {
  const executedQueries: Array<{ text: string; params?: unknown[] }> = [];

  await listProducts(
    {
      username: "  seller-one  ",
      categoryId: 7,
      status: "flagged",
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
              total: 1
            }
          ]) as unknown as QueryResult<T>;
        }

        return createQueryResult([]) as unknown as QueryResult<T>;
      }
    }
  );

  expect(executedQueries[0]?.text).toContain("LOWER(BTRIM(u.username)) = LOWER(BTRIM($1))");
  expect(executedQueries[0]?.text).toContain('p."productCategoryId" = $2');
  expect(executedQueries[0]?.text).toContain(`p."policyAction" = 'flag'`);
  expect(executedQueries[0]?.params).toEqual(["seller-one", 7, 50, 50]);
  expect(executedQueries[1]?.params).toEqual(["seller-one", 7]);

  await expect(
    listProducts({
      page: 0,
      limit: 20
    })
  ).rejects.toThrow(ProductListValidationError);

  await expect(
    listProducts({
      page: 1,
      limit: 0
    })
  ).rejects.toThrow(ProductListValidationError);

  await expect(
    listProducts({
      username: "   ",
      page: 1,
      limit: 20
    })
  ).rejects.toThrow("username is required and must be a non-empty string");

  await expect(
    listProducts({
      categoryId: 0,
      page: 1,
      limit: 20
    })
  ).rejects.toThrow("id must be a positive integer");

  await expect(
    listProducts({
      status: "archived" as "active",
      page: 1,
      limit: 20
    })
  ).rejects.toThrow("status must be one of active, flagged, out_of_stock");
});

test("GET /admin/products returns 401 when the admin token is missing", async () => {
  const application = express();

  application.use(
    "/admin/products",
    createAdminProductsCollectionRouter({
      authenticateAdminMiddleware: createAuthenticateAdminMiddleware({
        authenticateAdminTokenHandler: async () => createAuthenticatedAdmin()
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/products`);

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("GET /admin/products returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(
    "/admin/products",
    createAdminProductsCollectionRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "support"
        })
      ),
      listProductsHandler: async () => ({
        products: [],
        total: 0
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/products`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("GET /admin/products validates query parameters", async () => {
  const application = express();

  application.use(
    "/admin/products",
    createAdminProductsCollectionRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listProductsHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/products?username=`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "username must be a non-empty string when provided"
    );

    response = await fetch(`${server.baseUrl}/admin/products?categoryId=abc`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "categoryId must be a positive integer"
    );

    response = await fetch(`${server.baseUrl}/admin/products?status=archived`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "status must be one of active, flagged, out_of_stock"
    );

    response = await fetch(`${server.baseUrl}/admin/products?page=0`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "page must be a positive integer"
    );

    response = await fetch(`${server.baseUrl}/admin/products?limit=0`, {
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "limit must be a positive integer"
    );
  } finally {
    await server.close();
  }
});

test("GET /admin/products returns the filtered product list payload", async () => {
  const application = express();

  application.use(
    "/admin/products",
    createAdminProductsCollectionRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      listProductsHandler: async (filters): Promise<AdminProductsListResponse> => {
        expect(filters).toEqual({
          username: "seller-one",
          categoryId: 7,
          status: "flagged",
          page: 2,
          limit: 100
        });

        return {
          products: [
            {
              id: 64,
              name: "Counterfeit Headset",
              sellerUsername: "seller-one",
              categoryId: 7,
              categoryName: "Audio & Hifi",
              price: 10000,
              currency: "NGN",
              quantity: 8,
              status: "flagged",
              createdAt: "2026-04-07T12:00:00.000Z"
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
      `${server.baseUrl}/admin/products?username=seller-one&categoryId=7&status=flagged&page=2&limit=250`,
      {
        headers: {
          Authorization: "Bearer any-token"
        }
      }
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      products: [
        {
          id: 64,
          name: "Counterfeit Headset",
          sellerUsername: "seller-one",
          categoryId: 7,
          categoryName: "Audio & Hifi",
          price: 10000,
          currency: "NGN",
          quantity: 8,
          status: "flagged",
          createdAt: "2026-04-07T12:00:00.000Z"
        }
      ],
      total: 1
    });
  } finally {
    await server.close();
  }
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

test("PUT /admin/product/categories/:id returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Updated Audio & Hifi"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/product/categories/:id returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "finance"
        })
      ),
      updateProductCategoryHandler: async () => ({
        message: "Category updated successfully",
        productCategory: {
          id: 7,
          name: "Updated Audio & Hifi",
          description: "Updated audio devices and related products",
          basicCommissionVat: 15,
          standardCommissionVat: 13.5,
          premiumCommissionVat: 12.5
        }
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Updated Audio & Hifi"
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/product/categories/:id validates the id, request body, and optional fields", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateProductCategoryHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/product/categories/abc`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Updated Audio & Hifi"
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "id must be a positive integer"
    );

    response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "At least one category field must be provided for update"
    );

    response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        description: "   "
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "description must be a non-empty string when provided"
    );

    response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        premiumCommissionVat: "12.5"
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

test("PUT /admin/product/categories/:id maps not-found and conflict errors", async () => {
  let server;
  const notFoundApplication = express();

  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateProductCategoryHandler: async () => {
        throw new ProductCategoryNotFoundError("Product category not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories/999`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Updated Audio & Hifi"
      })
    });

    expect(response.status).toBe(404);
  } finally {
    await server.close();
  }

  const conflictApplication = express();

  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateProductCategoryHandler: async () => {
        throw new ProductCategoryConflictError("A product category with this name already exists");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        name: "Updated Audio & Hifi"
      })
    });

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});

test("PUT /admin/product/categories/:id returns the updated category payload for valid partial updates", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      updateProductCategoryHandler: async (input): Promise<UpdateProductCategoryResponse> => {
        expect(input).toEqual({
          id: 7,
          standardCommissionVat: 13.5
        });

        return {
          message: "Category updated successfully",
          productCategory: {
            id: 7,
            name: "Audio & Hifi",
            description: "Audio devices and related products",
            basicCommissionVat: 15.5,
            standardCommissionVat: 13.5,
            premiumCommissionVat: 13
          }
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        standardCommissionVat: 13.5
      })
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toEqual({
      message: "Category updated successfully",
      productCategory: {
        id: 7,
        name: "Audio & Hifi",
        description: "Audio devices and related products",
        basicCommissionVat: 15.5,
        standardCommissionVat: 13.5,
        premiumCommissionVat: 13
      }
    });
  } finally {
    await server.close();
  }
});

test("DELETE /admin/product/categories/:id returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "DELETE"
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("DELETE /admin/product/categories/:id returns 403 for non-super-admins", async () => {
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
      deleteProductCategoryHandler: async () => ({
        message: "Category deleted successfully"
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("DELETE /admin/product/categories/:id validates the category id", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      deleteProductCategoryHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories/not-a-number`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "id must be a positive integer"
    );
  } finally {
    await server.close();
  }
});

test("DELETE /admin/product/categories/:id maps not-found and conflict errors", async () => {
  let server;
  const notFoundApplication = express();

  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      deleteProductCategoryHandler: async () => {
        throw new ProductCategoryNotFoundError("Product category not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories/999`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(404);
  } finally {
    await server.close();
  }

  const conflictApplication = express();

  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      deleteProductCategoryHandler: async () => {
        throw new ProductCategoryConflictError(
          "Product category cannot be deleted while linked products or category commissions exist"
        );
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});

test("DELETE /admin/product/categories/:id returns the success payload for a valid delete", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      deleteProductCategoryHandler: async (input): Promise<DeleteProductCategoryResponse> => {
        expect(input).toEqual({
          id: 7
        });

        return {
          message: "Category deleted successfully"
        };
      }
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/categories/7`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer any-token"
      }
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toEqual({
      message: "Category deleted successfully"
    });
  } finally {
    await server.close();
  }
});

test("PUT /admin/product/:productId/flag returns 401 when the admin token is missing", async () => {
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
    const response = await fetch(`${server.baseUrl}/admin/product/65/flag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Counterfeit product listing",
        action: "flag"
      })
    });

    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

test("PUT /admin/product/:productId/flag returns 403 for non-super-admins", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(
        createAuthenticatedAdmin({
          role: "finance"
        })
      ),
      moderateProductHandler: async () => ({
        message: "Product flagged successfully",
        productId: 65
      })
    })
  );

  const server = await startTestServer(application);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/65/flag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        reason: "Counterfeit product listing",
        action: "flag"
      })
    });

    expect(response.status).toBe(403);
  } finally {
    await server.close();
  }
});

test("PUT /admin/product/:productId/flag validates the product id and request body", async () => {
  const application = express();

  application.use(express.json());
  application.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      moderateProductHandler: async () => {
        throw new Error("This handler should not be called when validation fails");
      }
    })
  );

  const server = await startTestServer(application);

  try {
    let response = await fetch(`${server.baseUrl}/admin/product/not-a-number/flag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        reason: "Counterfeit product listing",
        action: "flag"
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "productId must be a positive integer"
    );

    response = await fetch(`${server.baseUrl}/admin/product/65/flag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        reason: "   ",
        action: "flag"
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "reason is required and must be a non-empty string"
    );

    response = await fetch(`${server.baseUrl}/admin/product/65/flag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        reason: "Counterfeit product listing",
        action: "archive"
      })
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Record<string, unknown>).message).toBe(
      "action must be either 'flag' or 'remove'"
    );
  } finally {
    await server.close();
  }
});

test("PUT /admin/product/:productId/flag maps not-found and conflict errors", async () => {
  let server;
  const notFoundApplication = express();

  notFoundApplication.use(express.json());
  notFoundApplication.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      moderateProductHandler: async () => {
        throw new ProductNotFoundError("Product not found");
      }
    })
  );

  server = await startTestServer(notFoundApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/999/flag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        reason: "Counterfeit product listing",
        action: "flag"
      })
    });

    expect(response.status).toBe(404);
  } finally {
    await server.close();
  }

  const conflictApplication = express();

  conflictApplication.use(express.json());
  conflictApplication.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      moderateProductHandler: async () => {
        throw new ProductModerationConflictError("Product is already removed");
      }
    })
  );

  server = await startTestServer(conflictApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/65/flag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        reason: "Counterfeit product listing",
        action: "remove"
      })
    });

    expect(response.status).toBe(409);
  } finally {
    await server.close();
  }
});

test("PUT /admin/product/:productId/flag returns the moderation payload for valid flag and remove actions", async () => {
  let server;
  const flagApplication = express();

  flagApplication.use(express.json());
  flagApplication.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      moderateProductHandler: async (input): Promise<ModerateProductResponse> => {
        expect(input).toEqual({
          productId: 65,
          reason: "Counterfeit product listing",
          action: "flag",
          actedByAdminUserId: "admin-user-id"
        });

        return {
          message: "Product flagged successfully",
          productId: 65
        };
      }
    })
  );

  server = await startTestServer(flagApplication);

  try {
    let response = await fetch(`${server.baseUrl}/admin/product/65/flag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        reason: "Counterfeit product listing",
        action: "flag"
      })
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Product flagged successfully",
      productId: 65
    });
  } finally {
    await server.close();
  }

  const removeApplication = express();

  removeApplication.use(express.json());
  removeApplication.use(
    "/admin/product",
    createAdminProductsRouter({
      authenticateAdminMiddleware: allowAuthenticatedAdmin(),
      moderateProductHandler: async (input): Promise<ModerateProductResponse> => {
        expect(input).toEqual({
          productId: 64,
          reason: "Policy-violating item",
          action: "remove",
          actedByAdminUserId: "admin-user-id"
        });

        return {
          message: "Product removed successfully",
          productId: 64
        };
      }
    })
  );

  server = await startTestServer(removeApplication);

  try {
    const response = await fetch(`${server.baseUrl}/admin/product/64/flag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer any-token"
      },
      body: JSON.stringify({
        reason: "Policy-violating item",
        action: "remove"
      })
    });

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toEqual({
      message: "Product removed successfully",
      productId: 64
    });
  } finally {
    await server.close();
  }
});
