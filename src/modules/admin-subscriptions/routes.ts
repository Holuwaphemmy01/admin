import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  AdminSubscriptionConflictError,
  AdminSubscriptionNotFoundError,
  AdminSubscriptionValidationError,
  createAdminSubscriptionPlan,
  deleteAdminSubscriptionPlan,
  grantAdminSubscriptionToUser,
  listAdminSubscriptions,
  revokeAdminSubscriptionForUser,
  updateAdminSubscriptionPlan
} from "./service";
import { AdminSubscriptionPlanType } from "./types";

interface AdminSubscriptionsRouterDependencies {
  createAdminSubscriptionPlanHandler?: typeof createAdminSubscriptionPlan;
  deleteAdminSubscriptionPlanHandler?: typeof deleteAdminSubscriptionPlan;
  grantAdminSubscriptionToUserHandler?: typeof grantAdminSubscriptionToUser;
  listAdminSubscriptionsHandler?: typeof listAdminSubscriptions;
  revokeAdminSubscriptionForUserHandler?: typeof revokeAdminSubscriptionForUser;
  updateAdminSubscriptionPlanHandler?: typeof updateAdminSubscriptionPlan;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isValidPlanType(value: unknown): value is AdminSubscriptionPlanType {
  return value === "seller" || value === "logistics";
}

function isValidPositiveInteger(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) > 0;
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
  const deleteAdminSubscriptionPlanHandler =
    dependencies.deleteAdminSubscriptionPlanHandler ?? deleteAdminSubscriptionPlan;
  const grantAdminSubscriptionToUserHandler =
    dependencies.grantAdminSubscriptionToUserHandler ?? grantAdminSubscriptionToUser;
  const listAdminSubscriptionsHandler =
    dependencies.listAdminSubscriptionsHandler ?? listAdminSubscriptions;
  const revokeAdminSubscriptionForUserHandler =
    dependencies.revokeAdminSubscriptionForUserHandler ?? revokeAdminSubscriptionForUser;
  const updateAdminSubscriptionPlanHandler =
    dependencies.updateAdminSubscriptionPlanHandler ?? updateAdminSubscriptionPlan;
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

  adminSubscriptionsRouter.put(
    "/plans/:id",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawId = Array.isArray(request.params.id)
        ? request.params.id[0] ?? ""
        : request.params.id ?? "";
      const body = request.body as {
        name?: unknown;
        price?: unknown;
        productLimit?: unknown;
        monthlyOrderLimit?: unknown;
        features?: unknown;
      };
      const rawName = typeof body.name === "string" ? body.name.trim() : body.name;
      const rawPrice = body.price;
      const rawProductLimit = body.productLimit;
      const rawMonthlyOrderLimit = body.monthlyOrderLimit;
      const rawFeatures = body.features;

      if (!isValidPositiveInteger(rawId)) {
        response.status(400).json({
          message: "id must be a positive integer"
        });

        return;
      }

      const hasProvidedField =
        body.name !== undefined ||
        body.price !== undefined ||
        body.productLimit !== undefined ||
        body.monthlyOrderLimit !== undefined ||
        body.features !== undefined;

      if (!hasProvidedField) {
        response.status(400).json({
          message: "At least one subscription plan field must be provided for update"
        });

        return;
      }

      if (body.name !== undefined && !isNonEmptyString(rawName)) {
        response.status(400).json({
          message: "name must be a non-empty string when provided"
        });

        return;
      }

      if (body.price !== undefined && !isValidPrice(rawPrice)) {
        response.status(400).json({
          message:
            "price must be a non-negative finite number with at most 2 decimal places when provided"
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
        const result = await updateAdminSubscriptionPlanHandler({
          id: Number(rawId),
          ...(body.name !== undefined ? { name: rawName as string } : {}),
          ...(body.price !== undefined ? { price: rawPrice as number } : {}),
          ...(body.productLimit !== undefined
            ? { productLimit: rawProductLimit as number }
            : {}),
          ...(body.monthlyOrderLimit !== undefined
            ? { monthlyOrderLimit: rawMonthlyOrderLimit as number }
            : {}),
          ...(body.features !== undefined
            ? {
                features: (rawFeatures as string[]).map((feature) => feature.trim())
              }
            : {})
        });

        response.json(result);
      } catch (error) {
        if (error instanceof AdminSubscriptionValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSubscriptionNotFoundError) {
          response.status(404).json({
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

  adminSubscriptionsRouter.delete(
    "/plans/:id",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawId = Array.isArray(request.params.id)
        ? request.params.id[0] ?? ""
        : request.params.id ?? "";

      if (!isValidPositiveInteger(rawId)) {
        response.status(400).json({
          message: "id must be a positive integer"
        });

        return;
      }

      try {
        const result = await deleteAdminSubscriptionPlanHandler({
          id: Number(rawId)
        });

        response.json(result);
      } catch (error) {
        if (error instanceof AdminSubscriptionValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSubscriptionNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminSubscriptionsRouter.put(
    "/:username/grant",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawUsername = Array.isArray(request.params.username)
        ? request.params.username[0] ?? ""
        : request.params.username ?? "";
      const username = rawUsername.trim();
      const body = request.body as {
        subscriptionId?: unknown;
        expiryDate?: unknown;
      };

      if (username === "") {
        response.status(400).json({
          message: "username must be a non-empty string"
        });

        return;
      }

      if (
        !(
          typeof body.subscriptionId === "number" &&
          Number.isInteger(body.subscriptionId) &&
          body.subscriptionId > 0
        )
      ) {
        response.status(400).json({
          message: "subscriptionId is required and must be a positive integer"
        });

        return;
      }

      if (
        body.expiryDate !== undefined &&
        (typeof body.expiryDate !== "string" ||
          body.expiryDate.trim() === "" ||
          Number.isNaN(new Date(body.expiryDate.trim()).getTime()))
      ) {
        response.status(400).json({
          message: "expiryDate must be a valid ISO 8601 date-time string when provided"
        });

        return;
      }

      try {
        const result = await grantAdminSubscriptionToUserHandler({
          username,
          subscriptionId: body.subscriptionId,
          ...(body.expiryDate !== undefined ? { expiryDate: body.expiryDate.trim() } : {})
        });

        response.json(result);
      } catch (error) {
        if (error instanceof AdminSubscriptionValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSubscriptionNotFoundError) {
          response.status(404).json({
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

  adminSubscriptionsRouter.put(
    "/:username/revoke",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawUsername = Array.isArray(request.params.username)
        ? request.params.username[0] ?? ""
        : request.params.username ?? "";
      const username = rawUsername.trim();
      const body = request.body as {
        reason?: unknown;
      };

      if (username === "") {
        response.status(400).json({
          message: "username must be a non-empty string"
        });

        return;
      }

      if (body.reason !== undefined && !isNonEmptyString(body.reason)) {
        response.status(400).json({
          message: "reason must be a non-empty string when provided"
        });

        return;
      }

      try {
        const result = await revokeAdminSubscriptionForUserHandler({
          username,
          ...(body.reason !== undefined ? { reason: body.reason.trim() } : {})
        });

        response.json(result);
      } catch (error) {
        if (error instanceof AdminSubscriptionValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSubscriptionNotFoundError) {
          response.status(404).json({
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
