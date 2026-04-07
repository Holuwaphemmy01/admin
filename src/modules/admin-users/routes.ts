import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  getPlatformUserProfile,
  listPlatformUsers,
  PlatformUserProfileConflictError,
  PlatformUserProfileNotFoundError,
  PlatformUserProfileValidationError
} from "./service";
import {
  AdminUsersListFilters,
  DEFAULT_ADMIN_USERS_LIMIT,
  DEFAULT_ADMIN_USERS_PAGE,
  MAX_ADMIN_USERS_LIMIT,
  PLATFORM_USER_STATUS_CODES,
  PLATFORM_USER_TYPE_IDS,
  PlatformUserStatusCode,
  PlatformUserTypeId
} from "./types";

interface AdminUsersRouterDependencies {
  listPlatformUsersHandler?: typeof listPlatformUsers;
  getPlatformUserProfileHandler?: typeof getPlatformUserProfile;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

class AdminUsersQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminUsersQueryValidationError";
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
    throw new AdminUsersQueryValidationError(`${fieldName} must be a positive integer`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminUsersQueryValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function parseUserTypeId(value: string): PlatformUserTypeId {
  const parsedValue = parsePositiveInteger(value, "userTypeId");

  if (!PLATFORM_USER_TYPE_IDS.includes(parsedValue as PlatformUserTypeId)) {
    throw new AdminUsersQueryValidationError("userTypeId must be one of 1, 2, 3");
  }

  return parsedValue as PlatformUserTypeId;
}

function parseStatusCode(value: string): PlatformUserStatusCode {
  const parsedValue = parsePositiveInteger(value, "status");

  if (!PLATFORM_USER_STATUS_CODES.includes(parsedValue as PlatformUserStatusCode)) {
    throw new AdminUsersQueryValidationError("status must be one of 1, 2");
  }

  return parsedValue as PlatformUserStatusCode;
}

function parseIsoDate(value: string, fieldName: string): Date {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AdminUsersQueryValidationError(`${fieldName} must be a valid ISO 8601 datetime`);
  }

  return parsedDate;
}

export function createAdminUsersRouter(
  dependencies: AdminUsersRouterDependencies = {}
): Router {
  const adminUsersRouter = Router();
  const listPlatformUsersHandler = dependencies.listPlatformUsersHandler ?? listPlatformUsers;
  const getPlatformUserProfileHandler =
    dependencies.getPlatformUserProfileHandler ?? getPlatformUserProfile;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminUsersRouter.get(
    "/",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const userTypeIdQuery = readSingleQueryValue(request.query.userTypeId);
        const statusQuery = readSingleQueryValue(request.query.status);
        const pageQuery = readSingleQueryValue(request.query.page);
        const limitQuery = readSingleQueryValue(request.query.limit);
        const fromQuery = readSingleQueryValue(request.query.from);
        const toQuery = readSingleQueryValue(request.query.to);

        const filters: AdminUsersListFilters = {
          page: DEFAULT_ADMIN_USERS_PAGE,
          limit: DEFAULT_ADMIN_USERS_LIMIT
        };

        if (typeof userTypeIdQuery === "string" && userTypeIdQuery !== "") {
          filters.userTypeId = parseUserTypeId(userTypeIdQuery);
        } else if (userTypeIdQuery === "") {
          throw new AdminUsersQueryValidationError("userTypeId must be one of 1, 2, 3");
        }

        if (typeof statusQuery === "string" && statusQuery !== "") {
          filters.status = parseStatusCode(statusQuery);
        } else if (statusQuery === "") {
          throw new AdminUsersQueryValidationError("status must be one of 1, 2");
        }

        if (typeof pageQuery === "string" && pageQuery !== "") {
          filters.page = parsePositiveInteger(pageQuery, "page");
        } else if (pageQuery === "") {
          throw new AdminUsersQueryValidationError("page must be a positive integer");
        }

        if (typeof limitQuery === "string" && limitQuery !== "") {
          const parsedLimit = parsePositiveInteger(limitQuery, "limit");
          filters.limit = Math.min(parsedLimit, MAX_ADMIN_USERS_LIMIT);
        } else if (limitQuery === "") {
          throw new AdminUsersQueryValidationError("limit must be a positive integer");
        }

        if (typeof fromQuery === "string" && fromQuery !== "") {
          filters.from = parseIsoDate(fromQuery, "from");
        } else if (fromQuery === "") {
          throw new AdminUsersQueryValidationError("from must be a valid ISO 8601 datetime");
        }

        if (typeof toQuery === "string" && toQuery !== "") {
          filters.to = parseIsoDate(toQuery, "to");
        } else if (toQuery === "") {
          throw new AdminUsersQueryValidationError("to must be a valid ISO 8601 datetime");
        }

        if (filters.from && filters.to && filters.from > filters.to) {
          throw new AdminUsersQueryValidationError("from must be less than or equal to to");
        }

        const usersResponse = await listPlatformUsersHandler(filters);

        response.json(usersResponse);
      } catch (error) {
        if (error instanceof AdminUsersQueryValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminUsersRouter.get(
    "/:username",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawUsername = request.params.username;
      const username = Array.isArray(rawUsername) ? rawUsername[0] ?? "" : rawUsername ?? "";

      try {
        const userProfileResponse = await getPlatformUserProfileHandler(username);

        response.json(userProfileResponse);
      } catch (error) {
        if (error instanceof PlatformUserProfileValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof PlatformUserProfileNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof PlatformUserProfileConflictError) {
          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminUsersRouter;
}

const adminUsersRouter = createAdminUsersRouter();

export default adminUsersRouter;
