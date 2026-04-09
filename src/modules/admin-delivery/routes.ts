import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  createDeliveryPricing,
  listDeliveryPricing,
  DeliveryPricingConflictError,
  DeliveryPricingValidationError
} from "./service";
import { DeliveryVehicleType } from "./types";

interface AdminDeliveryRouterDependencies {
  createDeliveryPricingHandler?: typeof createDeliveryPricing;
  listDeliveryPricingHandler?: typeof listDeliveryPricing;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isValidVehicleType(value: unknown): value is DeliveryVehicleType {
  return value === "bike" || value === "car" || value === "truck";
}

function isValidBaseFee(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    Math.abs(value - Number(value.toFixed(2))) <= Number.EPSILON
  );
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

export function createAdminDeliveryRouter(
  dependencies: AdminDeliveryRouterDependencies = {}
): Router {
  const adminDeliveryRouter = Router();
  const createDeliveryPricingHandler =
    dependencies.createDeliveryPricingHandler ?? createDeliveryPricing;
  const listDeliveryPricingHandler =
    dependencies.listDeliveryPricingHandler ?? listDeliveryPricing;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminDeliveryRouter.get(
    "/pricing",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawState = readSingleQueryValue(request.query.state);
      const rawVehicleType = readSingleQueryValue(request.query.vehicleType);

      if (rawState !== undefined && rawState === "") {
        response.status(400).json({
          message: "state must be a non-empty string when provided"
        });

        return;
      }

      if (rawVehicleType !== undefined && !isValidVehicleType(rawVehicleType)) {
        response.status(400).json({
          message: "vehicleType must be one of bike, car, truck when provided"
        });

        return;
      }

      try {
        const result = await listDeliveryPricingHandler({
          state: rawState,
          vehicleType: rawVehicleType
        });

        response.json(result);
      } catch (error) {
        if (error instanceof DeliveryPricingValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminDeliveryRouter.post(
    "/pricing",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const body = request.body as {
        state?: unknown;
        vehicleType?: unknown;
        baseFee?: unknown;
      };
      const rawState = typeof body.state === "string" ? body.state.trim() : "";
      const rawVehicleType = body.vehicleType;
      const rawBaseFee = body.baseFee;

      if (!isNonEmptyString(rawState)) {
        response.status(400).json({
          message: "state is required and must be a non-empty string"
        });

        return;
      }

      if (!isValidVehicleType(rawVehicleType)) {
        response.status(400).json({
          message: "vehicleType must be one of bike, car, truck"
        });

        return;
      }

      if (!isValidBaseFee(rawBaseFee)) {
        response.status(400).json({
          message:
            "baseFee is required and must be a non-negative finite number with at most 2 decimal places"
        });

        return;
      }

      try {
        const result = await createDeliveryPricingHandler({
          state: rawState,
          vehicleType: rawVehicleType,
          baseFee: rawBaseFee
        });

        console.info(
          `Delivery pricing created for "${rawState}" with vehicle type "${rawVehicleType}".`
        );

        response.status(201).json(result);
      } catch (error) {
        if (error instanceof DeliveryPricingValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof DeliveryPricingConflictError) {
          console.warn(
            `Delivery pricing creation conflict for "${rawState}" and "${rawVehicleType}".`
          );

          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminDeliveryRouter;
}

const adminDeliveryRouter = createAdminDeliveryRouter();

export default adminDeliveryRouter;
