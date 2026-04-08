import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  createProductCategory,
  ProductCategoryConflictError,
  ProductCategoryValidationError
} from "./service";

interface AdminProductsRouterDependencies {
  createProductCategoryHandler?: typeof createProductCategory;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isValidPercentage(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function createAdminProductsRouter(
  dependencies: AdminProductsRouterDependencies = {}
): Router {
  const adminProductsRouter = Router();
  const createProductCategoryHandler =
    dependencies.createProductCategoryHandler ?? createProductCategory;
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

  return adminProductsRouter;
}

const adminProductsRouter = createAdminProductsRouter();

export default adminProductsRouter;
