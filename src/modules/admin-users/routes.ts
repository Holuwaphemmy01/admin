import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  activatePlatformUser,
  deletePlatformUser,
  getPlatformUserStats,
  PlatformUserStatsValidationError,
  PlatformUserDeletionConflictError,
  PlatformUserDeletionNotFoundError,
  PlatformUserDeletionValidationError,
  getPlatformUserProfile,
  listPlatformUsers,
  PlatformUserActivationConflictError,
  PlatformUserActivationNotFoundError,
  PlatformUserActivationValidationError,
  PlatformUserProfileConflictError,
  PlatformUserProfileNotFoundError,
  PlatformUserProfileValidationError,
  PlatformUserSuspensionConflictError,
  PlatformUserSuspensionNotFoundError,
  PlatformUserSuspensionValidationError,
  suspendPlatformUser
} from "./service";
import {
  ACTIVE_PLATFORM_USER_STATUS_CODE,
  ADMIN_USERS_STATS_PERIODS,
  AdminUsersStatsPeriod,
  AdminUsersListFilters,
  DEFAULT_ADMIN_USERS_LIMIT,
  DEFAULT_ADMIN_USERS_PAGE,
  MAX_ADMIN_USERS_LIMIT,
  PLATFORM_USER_STATUS_CODES,
  PLATFORM_USER_TYPE_IDS,
  PlatformUserStatusCode,
  PlatformUserTypeId,
  SUSPENDED_PLATFORM_USER_STATUS_CODE
} from "./types";

interface AdminUsersRouterDependencies {
  listPlatformUsersHandler?: typeof listPlatformUsers;
  getPlatformUserStatsHandler?: typeof getPlatformUserStats;
  getPlatformUserProfileHandler?: typeof getPlatformUserProfile;
  suspendPlatformUserHandler?: typeof suspendPlatformUser;
  activatePlatformUserHandler?: typeof activatePlatformUser;
  deletePlatformUserHandler?: typeof deletePlatformUser;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

class AdminUsersQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminUsersQueryValidationError";
  }
}

function isValidCredentialField(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
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

function parseStatsPeriod(value: string): AdminUsersStatsPeriod {
  const normalizedValue = value.trim().toLowerCase();

  if (!ADMIN_USERS_STATS_PERIODS.includes(normalizedValue as AdminUsersStatsPeriod)) {
    throw new AdminUsersQueryValidationError("period must be one of daily, weekly, monthly");
  }

  return normalizedValue as AdminUsersStatsPeriod;
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
  const getPlatformUserStatsHandler =
    dependencies.getPlatformUserStatsHandler ?? getPlatformUserStats;
  const getPlatformUserProfileHandler =
    dependencies.getPlatformUserProfileHandler ?? getPlatformUserProfile;
  const suspendPlatformUserHandler =
    dependencies.suspendPlatformUserHandler ?? suspendPlatformUser;
  const activatePlatformUserHandler =
    dependencies.activatePlatformUserHandler ?? activatePlatformUser;
  const deletePlatformUserHandler =
    dependencies.deletePlatformUserHandler ?? deletePlatformUser;
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
    "/stats",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const periodQuery = readSingleQueryValue(request.query.period);
        let period: AdminUsersStatsPeriod | undefined;

        if (typeof periodQuery === "string" && periodQuery !== "") {
          period = parseStatsPeriod(periodQuery);
        } else if (periodQuery === "") {
          throw new AdminUsersQueryValidationError("period must be one of daily, weekly, monthly");
        }

        const statsResponse = await getPlatformUserStatsHandler(period);

        response.json(statsResponse);
      } catch (error) {
        if (
          error instanceof AdminUsersQueryValidationError ||
          error instanceof PlatformUserStatsValidationError
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

  adminUsersRouter.put(
    "/:username/suspend",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawUsername = request.params.username;
      const username = Array.isArray(rawUsername) ? rawUsername[0] ?? "" : rawUsername ?? "";
      const { status, comment } = request.body ?? {};

      if (username.trim() === "") {
        response.status(400).json({
          message: "username must be a non-empty string"
        });

        return;
      }

      if (status !== SUSPENDED_PLATFORM_USER_STATUS_CODE) {
        response.status(400).json({
          message: "status must be 2"
        });

        return;
      }

      if (!isValidCredentialField(comment)) {
        response.status(400).json({
          message: "comment is required and must be a non-empty string"
        });

        return;
      }

      if (!request.admin) {
        response.status(401).json({
          message: "Unauthorized admin access"
        });

        return;
      }

      try {
        const suspensionResponse = await suspendPlatformUserHandler({
          username,
          status,
          comment,
          suspendedByAdmin: request.admin
        });

        console.info(
          `User account suspended for "${username.trim()}" by "${request.admin.username}".`
        );

        response.json(suspensionResponse);
      } catch (error) {
        if (error instanceof PlatformUserSuspensionValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof PlatformUserSuspensionNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof PlatformUserSuspensionConflictError) {
          console.warn(`User suspension conflict for "${username.trim()}".`);

          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminUsersRouter.put(
    "/:username/activate",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawUsername = request.params.username;
      const username = Array.isArray(rawUsername) ? rawUsername[0] ?? "" : rawUsername ?? "";
      const { status, comment } = request.body ?? {};

      if (username.trim() === "") {
        response.status(400).json({
          message: "username must be a non-empty string"
        });

        return;
      }

      if (status !== ACTIVE_PLATFORM_USER_STATUS_CODE) {
        response.status(400).json({
          message: "status must be 1"
        });

        return;
      }

      if (comment !== undefined && !isValidCredentialField(comment)) {
        response.status(400).json({
          message: "comment must be a non-empty string when provided"
        });

        return;
      }

      if (!request.admin) {
        response.status(401).json({
          message: "Unauthorized admin access"
        });

        return;
      }

      try {
        const activationResponse = await activatePlatformUserHandler({
          username,
          status,
          comment,
          activatedByAdmin: request.admin
        });

        console.info(
          `User account reactivated for "${username.trim()}" by "${request.admin.username}".`
        );

        response.json(activationResponse);
      } catch (error) {
        if (error instanceof PlatformUserActivationValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof PlatformUserActivationNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof PlatformUserActivationConflictError) {
          console.warn(`User activation conflict for "${username.trim()}".`);

          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminUsersRouter.delete(
    "/:username",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawUsername = request.params.username;
      const username = Array.isArray(rawUsername) ? rawUsername[0] ?? "" : rawUsername ?? "";
      const { reason } = request.body ?? {};

      if (username.trim() === "") {
        response.status(400).json({
          message: "username must be a non-empty string"
        });

        return;
      }

      if (!isValidCredentialField(reason)) {
        response.status(400).json({
          message: "reason is required and must be a non-empty string"
        });

        return;
      }

      if (!request.admin) {
        response.status(401).json({
          message: "Unauthorized admin access"
        });

        return;
      }

      try {
        const deletionResponse = await deletePlatformUserHandler({
          username,
          reason,
          deletedByAdmin: request.admin
        });

        console.info(`User account permanently deleted for "${username.trim()}".`);

        response.json(deletionResponse);
      } catch (error) {
        if (error instanceof PlatformUserDeletionValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof PlatformUserDeletionNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof PlatformUserDeletionConflictError) {
          console.warn(`User deletion conflict for "${username.trim()}".`);

          response.status(409).json({
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
