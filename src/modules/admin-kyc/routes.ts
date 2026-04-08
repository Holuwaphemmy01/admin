import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import { listPendingKycSubmissions } from "./service";
import {
  DEFAULT_PENDING_KYC_LIMIT,
  DEFAULT_PENDING_KYC_PAGE,
  MAX_PENDING_KYC_LIMIT,
  PendingKycListFilters,
  PendingKycType,
  PENDING_KYC_TYPES
} from "./types";

interface AdminKycRouterDependencies {
  listPendingKycSubmissionsHandler?: typeof listPendingKycSubmissions;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

class AdminKycQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminKycQueryValidationError";
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
    throw new AdminKycQueryValidationError(`${fieldName} must be a positive integer`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminKycQueryValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function parsePendingKycType(value: string): PendingKycType {
  const normalizedValue = value.trim().toLowerCase();

  if (!PENDING_KYC_TYPES.includes(normalizedValue as PendingKycType)) {
    throw new AdminKycQueryValidationError(
      "type must be one of individual_seller, registered_company, individual_logistic, registered_logistic"
    );
  }

  return normalizedValue as PendingKycType;
}

export function createAdminKycRouter(
  dependencies: AdminKycRouterDependencies = {}
): Router {
  const adminKycRouter = Router();
  const listPendingKycSubmissionsHandler =
    dependencies.listPendingKycSubmissionsHandler ?? listPendingKycSubmissions;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminKycRouter.get(
    "/pending",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const typeQuery = readSingleQueryValue(request.query.type);
        const pageQuery = readSingleQueryValue(request.query.page);
        const limitQuery = readSingleQueryValue(request.query.limit);

        const filters: PendingKycListFilters = {
          page: DEFAULT_PENDING_KYC_PAGE,
          limit: DEFAULT_PENDING_KYC_LIMIT
        };

        if (typeof typeQuery === "string" && typeQuery !== "") {
          filters.type = parsePendingKycType(typeQuery);
        } else if (typeQuery === "") {
          throw new AdminKycQueryValidationError(
            "type must be one of individual_seller, registered_company, individual_logistic, registered_logistic"
          );
        }

        if (typeof pageQuery === "string" && pageQuery !== "") {
          filters.page = parsePositiveInteger(pageQuery, "page");
        } else if (pageQuery === "") {
          throw new AdminKycQueryValidationError("page must be a positive integer");
        }

        if (typeof limitQuery === "string" && limitQuery !== "") {
          const parsedLimit = parsePositiveInteger(limitQuery, "limit");
          filters.limit = Math.min(parsedLimit, MAX_PENDING_KYC_LIMIT);
        } else if (limitQuery === "") {
          throw new AdminKycQueryValidationError("limit must be a positive integer");
        }

        const pendingKycResponse = await listPendingKycSubmissionsHandler(filters);

        response.json(pendingKycResponse);
      } catch (error) {
        if (error instanceof AdminKycQueryValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminKycRouter;
}

const adminKycRouter = createAdminKycRouter();

export default adminKycRouter;
