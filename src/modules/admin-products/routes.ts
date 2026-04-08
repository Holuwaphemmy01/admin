import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  createProductCategory,
  ProductCategoryConflictError,
  ProductCategoryNotFoundError,
  ProductCategoryValidationError,
  updateProductCategory
} from "./service";

interface AdminProductsRouterDependencies {
  createProductCategoryHandler?: typeof createProductCategory;
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

export function createAdminProductsRouter(
  dependencies: AdminProductsRouterDependencies = {}
): Router {
  const adminProductsRouter = Router();
  const createProductCategoryHandler =
    dependencies.createProductCategoryHandler ?? createProductCategory;
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

  return adminProductsRouter;
}

const adminProductsRouter = createAdminProductsRouter();

export default adminProductsRouter;
