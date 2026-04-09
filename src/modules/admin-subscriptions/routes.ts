import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  AdminSubscriptionConflictError,
  AdminSubscriptionValidationError,
  createAdminSubscriptionPlan,
  listAdminSubscriptions
} from "./service";
import { AdminSubscriptionPlanType } from "./types";

interface AdminSubscriptionsRouterDependencies {
  createAdminSubscriptionPlanHandler?: typeof createAdminSubscriptionPlan;
  listAdminSubscriptionsHandler?: typeof listAdminSubscriptions;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

function isValidPlanType(value: unknown): value is AdminSubscriptionPlanType {
  return value === "seller" || value === "logistics";
}

function isValidPrice(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    Math.abs(value - Number(value.toFixed(2))) <= Number.EPSILON
  );
}

function isValidOptionalNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function createAdminSubscriptionsRouter(
  dependencies: AdminSubscriptionsRouterDependencies = {}
): Router {
  const adminSubscriptionsRouter = Router();
  const createAdminSubscriptionPlanHandler =
    dependencies.createAdminSubscriptionPlanHandler ?? createAdminSubscriptionPlan;
  const listAdminSubscriptionsHandler =
    dependencies.listAdminSubscriptionsHandler ?? listAdminSubscriptions;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminSubscriptionsRouter.get(
    "/",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (_request: Request, response: Response, next) => {
      try {
        const subscriptions = await listAdminSubscriptionsHandler();

        response.json(subscriptions);
      } catch (error) {
        next(error);
      }
    }
  );

  adminSubscriptionsRouter.post(
    "/plans",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const body = request.body as {
        name?: unknown;
        type?: unknown;
        price?: unknown;
        productLimit?: unknown;
        monthlyOrderLimit?: unknown;
        features?: unknown;
      };
      const rawName = typeof body.name === "string" ? body.name.trim() : "";
      const rawType = body.type;
      const rawPrice = body.price;
      const rawProductLimit = body.productLimit;
      const rawMonthlyOrderLimit = body.monthlyOrderLimit;
      const rawFeatures = body.features;

      if (rawName === "") {
        response.status(400).json({
          message: "name is required and must be a non-empty string"
        });

        return;
      }

      if (!isValidPlanType(rawType)) {
        response.status(400).json({
          message: "type is required and must be one of seller, logistics"
        });

        return;
      }

      if (!isValidPrice(rawPrice)) {
        response.status(400).json({
          message:
            "price is required and must be a non-negative finite number with at most 2 decimal places"
        });

        return;
      }

      if (
        rawProductLimit !== undefined &&
        !isValidOptionalNonNegativeInteger(rawProductLimit)
      ) {
        response.status(400).json({
          message: "productLimit must be a non-negative integer when provided"
        });

        return;
      }

      if (
        rawMonthlyOrderLimit !== undefined &&
        !isValidOptionalNonNegativeInteger(rawMonthlyOrderLimit)
      ) {
        response.status(400).json({
          message: "monthlyOrderLimit must be a non-negative integer when provided"
        });

        return;
      }

      if (
        rawFeatures !== undefined &&
        (!Array.isArray(rawFeatures) ||
          rawFeatures.some(
            (feature) => typeof feature !== "string" || feature.trim() === ""
          ))
      ) {
        response.status(400).json({
          message: "features must be an array of non-empty strings when provided"
        });

        return;
      }

      try {
        const result = await createAdminSubscriptionPlanHandler({
          name: rawName,
          type: rawType,
          price: rawPrice,
          productLimit: rawProductLimit,
          monthlyOrderLimit: rawMonthlyOrderLimit,
          features: Array.isArray(rawFeatures)
            ? rawFeatures.map((feature) => feature.trim())
            : undefined
        });

        response.status(201).json(result);
      } catch (error) {
        if (error instanceof AdminSubscriptionValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSubscriptionConflictError) {
          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminSubscriptionsRouter;
}

const adminSubscriptionsRouter = createAdminSubscriptionsRouter();

export default adminSubscriptionsRouter;
