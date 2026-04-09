import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  DEFAULT_ADMIN_SETTLEMENTS_LIMIT,
  DEFAULT_ADMIN_SETTLEMENTS_PAGE,
  MAX_ADMIN_SETTLEMENTS_LIMIT,
  AdminSettlementStatus,
  AdminSettlementsListFilters
} from "./types";
import {
  AdminSettlementsValidationError,
  listAdminSettlements
} from "./service";

interface AdminSettlementsRouterDependencies {
  listAdminSettlementsHandler?: typeof listAdminSettlements;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

class AdminSettlementsQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSettlementsQueryValidationError";
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
    throw new AdminSettlementsQueryValidationError(`${fieldName} must be a positive integer`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminSettlementsQueryValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function parseSettlementStatus(value: string): AdminSettlementStatus {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue !== "pending" &&
    normalizedValue !== "approved" &&
    normalizedValue !== "rejected"
  ) {
    throw new AdminSettlementsQueryValidationError(
      "status must be one of pending, approved, or rejected"
    );
  }

  return normalizedValue;
}

export function createAdminSettlementsRouter(
  dependencies: AdminSettlementsRouterDependencies = {}
): Router {
  const adminSettlementsRouter = Router();
  const listAdminSettlementsHandler =
    dependencies.listAdminSettlementsHandler ?? listAdminSettlements;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminSettlementsRouter.get(
    "/",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const statusQuery = readSingleQueryValue(request.query.status);
        const usernameQuery = readSingleQueryValue(request.query.username);
        const pageQuery = readSingleQueryValue(request.query.page);
        const limitQuery = readSingleQueryValue(request.query.limit);

        const filters: AdminSettlementsListFilters = {
          page: DEFAULT_ADMIN_SETTLEMENTS_PAGE,
          limit: DEFAULT_ADMIN_SETTLEMENTS_LIMIT
        };

        if (typeof statusQuery === "string" && statusQuery !== "") {
          filters.status = parseSettlementStatus(statusQuery);
        } else if (statusQuery === "") {
          throw new AdminSettlementsQueryValidationError(
            "status must be one of pending, approved, or rejected"
          );
        }

        if (typeof usernameQuery === "string" && usernameQuery !== "") {
          filters.username = usernameQuery;
        } else if (usernameQuery === "") {
          throw new AdminSettlementsQueryValidationError("username must be a non-empty string");
        }

        if (typeof pageQuery === "string" && pageQuery !== "") {
          filters.page = parsePositiveInteger(pageQuery, "page");
        } else if (pageQuery === "") {
          throw new AdminSettlementsQueryValidationError("page must be a positive integer");
        }

        if (typeof limitQuery === "string" && limitQuery !== "") {
          const parsedLimit = parsePositiveInteger(limitQuery, "limit");
          filters.limit = Math.min(parsedLimit, MAX_ADMIN_SETTLEMENTS_LIMIT);
        } else if (limitQuery === "") {
          throw new AdminSettlementsQueryValidationError("limit must be a positive integer");
        }

        const settlementsResponse = await listAdminSettlementsHandler(filters);

        response.json(settlementsResponse);
      } catch (error) {
        if (
          error instanceof AdminSettlementsQueryValidationError ||
          error instanceof AdminSettlementsValidationError
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

  return adminSettlementsRouter;
}

const adminSettlementsRouter = createAdminSettlementsRouter();

export default adminSettlementsRouter;
