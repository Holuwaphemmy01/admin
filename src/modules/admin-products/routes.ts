import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
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
} from "./service";
import { AdminProductsListFilters } from "./types";

interface AdminProductsRouterDependencies {
  createProductCategoryHandler?: typeof createProductCategory;
  deleteProductCategoryHandler?: typeof deleteProductCategory;
  listProductsHandler?: typeof listProducts;
  moderateProductHandler?: typeof moderateProduct;
  updateProductCategoryHandler?: typeof updateProductCategory;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isValidPercentage(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isValidPositiveInteger(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) > 0;
}

class AdminProductsQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminProductsQueryValidationError";
  }
}

function readSingleQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }

  return undefined;
}

function parsePositiveInteger(value: string, fieldName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new AdminProductsQueryValidationError(`${fieldName} must be a positive integer`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminProductsQueryValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function parseProductListStatus(value: string): AdminProductsListFilters["status"] {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue !== "active" &&
    normalizedValue !== "flagged" &&
    normalizedValue !== "out_of_stock"
  ) {
    throw new AdminProductsQueryValidationError(
      "status must be one of active, flagged, out_of_stock"
    );
  }

  return normalizedValue;
}

export function createAdminProductsRouter(
  dependencies: AdminProductsRouterDependencies = {}
): Router {
  const adminProductsRouter = Router();
  const createProductCategoryHandler =
    dependencies.createProductCategoryHandler ?? createProductCategory;
  const deleteProductCategoryHandler =
    dependencies.deleteProductCategoryHandler ?? deleteProductCategory;
  const moderateProductHandler = dependencies.moderateProductHandler ?? moderateProduct;
  const updateProductCategoryHandler =
    dependencies.updateProductCategoryHandler ?? updateProductCategory;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminProductsRouter.post(
    "/categories",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const {
        name,
        description,
        basicCommissionVat,
        standardCommissionVat,
        premiumCommissionVat
      } = request.body ?? {};

      if (!isNonEmptyString(name)) {
        response.status(400).json({
          message: "name is required and must be a non-empty string"
        });

        return;
      }

      if (!isNonEmptyString(description)) {
        response.status(400).json({
          message: "description is required and must be a non-empty string"
        });

        return;
      }

      if (!isValidPercentage(basicCommissionVat)) {
        response.status(400).json({
          message: "basicCommissionVat must be a finite number between 0 and 100"
        });

        return;
      }

      if (!isValidPercentage(standardCommissionVat)) {
        response.status(400).json({
          message: "standardCommissionVat must be a finite number between 0 and 100"
        });

        return;
      }

      if (!isValidPercentage(premiumCommissionVat)) {
        response.status(400).json({
          message: "premiumCommissionVat must be a finite number between 0 and 100"
        });

        return;
      }

      try {
        const createResponse = await createProductCategoryHandler({
          name,
          description,
          basicCommissionVat,
          standardCommissionVat,
          premiumCommissionVat
        });

        console.info(`Product category created: "${name.trim()}".`);

        response.status(201).json(createResponse);
      } catch (error) {
        if (error instanceof ProductCategoryValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ProductCategoryConflictError) {
          console.warn(`Product category creation conflict for "${name.trim()}".`);

          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminProductsRouter.put(
    "/categories/:id",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawId = request.params.id;
      const id = Array.isArray(rawId) ? rawId[0] ?? "" : rawId ?? "";
      const {
        name,
        description,
        basicCommissionVat,
        standardCommissionVat,
        premiumCommissionVat
      } = request.body ?? {};

      if (!isValidPositiveInteger(id)) {
        response.status(400).json({
          message: "id must be a positive integer"
        });

        return;
      }

      const hasProvidedField =
        name !== undefined ||
        description !== undefined ||
        basicCommissionVat !== undefined ||
        standardCommissionVat !== undefined ||
        premiumCommissionVat !== undefined;

      if (!hasProvidedField) {
        response.status(400).json({
          message: "At least one category field must be provided for update"
        });

        return;
      }

      if (name !== undefined && !isNonEmptyString(name)) {
        response.status(400).json({
          message: "name must be a non-empty string when provided"
        });

        return;
      }

      if (description !== undefined && !isNonEmptyString(description)) {
        response.status(400).json({
          message: "description must be a non-empty string when provided"
        });

        return;
      }

      if (basicCommissionVat !== undefined && !isValidPercentage(basicCommissionVat)) {
        response.status(400).json({
          message: "basicCommissionVat must be a finite number between 0 and 100"
        });

        return;
      }

      if (standardCommissionVat !== undefined && !isValidPercentage(standardCommissionVat)) {
        response.status(400).json({
          message: "standardCommissionVat must be a finite number between 0 and 100"
        });

        return;
      }

      if (premiumCommissionVat !== undefined && !isValidPercentage(premiumCommissionVat)) {
        response.status(400).json({
          message: "premiumCommissionVat must be a finite number between 0 and 100"
        });

        return;
      }

      try {
        const updateResponse = await updateProductCategoryHandler({
          id: Number(id),
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(basicCommissionVat !== undefined ? { basicCommissionVat } : {}),
          ...(standardCommissionVat !== undefined ? { standardCommissionVat } : {}),
          ...(premiumCommissionVat !== undefined ? { premiumCommissionVat } : {})
        });

        console.info(`Product category updated: "${id}".`);

        response.json(updateResponse);
      } catch (error) {
        if (error instanceof ProductCategoryValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ProductCategoryNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ProductCategoryConflictError) {
          console.warn(`Product category update conflict for "${id}".`);

          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminProductsRouter.delete(
    "/categories/:id",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawId = request.params.id;
      const id = Array.isArray(rawId) ? rawId[0] ?? "" : rawId ?? "";

      if (!isValidPositiveInteger(id)) {
        response.status(400).json({
          message: "id must be a positive integer"
        });

        return;
      }

      try {
        const deleteResponse = await deleteProductCategoryHandler({
          id: Number(id)
        });

        console.info(`Product category deleted: "${id}".`);

        response.json(deleteResponse);
      } catch (error) {
        if (error instanceof ProductCategoryValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ProductCategoryNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ProductCategoryConflictError) {
          console.warn(`Product category delete conflict for "${id}".`);

          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminProductsRouter.put(
    "/:productId/flag",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawProductId = request.params.productId;
      const productId = Array.isArray(rawProductId) ? rawProductId[0] ?? "" : rawProductId ?? "";
      const { reason, action } = request.body ?? {};

      if (!isValidPositiveInteger(productId)) {
        response.status(400).json({
          message: "productId must be a positive integer"
        });

        return;
      }

      if (!isNonEmptyString(reason)) {
        response.status(400).json({
          message: "reason is required and must be a non-empty string"
        });

        return;
      }

      if (action !== "flag" && action !== "remove") {
        response.status(400).json({
          message: "action must be either 'flag' or 'remove'"
        });

        return;
      }

      try {
        const moderationResponse = await moderateProductHandler({
          productId: Number(productId),
          reason,
          action,
          actedByAdminUserId: request.admin?.sub ?? ""
        });

        console.info(`Product moderation action applied: "${action}" on "${productId}".`);

        response.json(moderationResponse);
      } catch (error) {
        if (error instanceof ProductModerationValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ProductNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ProductModerationConflictError) {
          console.warn(`Product moderation conflict for "${productId}" with action "${action}".`);

          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminProductsRouter;
}

export function createAdminProductsCollectionRouter(
  dependencies: AdminProductsRouterDependencies = {}
): Router {
  const adminProductsCollectionRouter = Router();
  const listProductsHandler = dependencies.listProductsHandler ?? listProducts;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");
  const DEFAULT_PRODUCTS_PAGE = 1;
  const DEFAULT_PRODUCTS_LIMIT = 20;
  const MAX_PRODUCTS_LIMIT = 100;

  adminProductsCollectionRouter.get(
    "/",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const usernameQuery = readSingleQueryValue(request.query.username);
        const categoryIdQuery = readSingleQueryValue(request.query.categoryId);
        const statusQuery = readSingleQueryValue(request.query.status);
        const pageQuery = readSingleQueryValue(request.query.page);
        const limitQuery = readSingleQueryValue(request.query.limit);

        const filters: AdminProductsListFilters = {
          page: DEFAULT_PRODUCTS_PAGE,
          limit: DEFAULT_PRODUCTS_LIMIT
        };

        if (typeof usernameQuery === "string" && usernameQuery !== "") {
          filters.username = usernameQuery;
        } else if (usernameQuery === "") {
          throw new AdminProductsQueryValidationError(
            "username must be a non-empty string when provided"
          );
        }

        if (typeof categoryIdQuery === "string" && categoryIdQuery !== "") {
          filters.categoryId = parsePositiveInteger(categoryIdQuery, "categoryId");
        } else if (categoryIdQuery === "") {
          throw new AdminProductsQueryValidationError("categoryId must be a positive integer");
        }

        if (typeof statusQuery === "string" && statusQuery !== "") {
          filters.status = parseProductListStatus(statusQuery);
        } else if (statusQuery === "") {
          throw new AdminProductsQueryValidationError(
            "status must be one of active, flagged, out_of_stock"
          );
        }

        if (typeof pageQuery === "string" && pageQuery !== "") {
          filters.page = parsePositiveInteger(pageQuery, "page");
        } else if (pageQuery === "") {
          throw new AdminProductsQueryValidationError("page must be a positive integer");
        }

        if (typeof limitQuery === "string" && limitQuery !== "") {
          const parsedLimit = parsePositiveInteger(limitQuery, "limit");
          filters.limit = Math.min(parsedLimit, MAX_PRODUCTS_LIMIT);
        } else if (limitQuery === "") {
          throw new AdminProductsQueryValidationError("limit must be a positive integer");
        }

        const productsResponse = await listProductsHandler(filters);

        response.json(productsResponse);
      } catch (error) {
        if (
          error instanceof AdminProductsQueryValidationError ||
          error instanceof ProductListValidationError
        ) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminProductsCollectionRouter;
}

const adminProductsRouter = createAdminProductsRouter();
const adminProductsCollectionRouter = createAdminProductsCollectionRouter();

export default adminProductsRouter;
export { adminProductsCollectionRouter };
