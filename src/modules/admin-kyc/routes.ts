import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  approveUserKyc,
  ApproveUserKycConflictError,
  ApproveUserKycNotFoundError,
  ApproveUserKycValidationError,
  getUserKycSubmission,
  listPendingKycSubmissions,
  UserKycSubmissionConflictError,
  UserKycSubmissionNotFoundError,
  UserKycSubmissionValidationError
} from "./service";
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
  approveUserKycHandler?: typeof approveUserKyc;
  getUserKycSubmissionHandler?: typeof getUserKycSubmission;
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
  const approveUserKycHandler = dependencies.approveUserKycHandler ?? approveUserKyc;
  const getUserKycSubmissionHandler =
    dependencies.getUserKycSubmissionHandler ?? getUserKycSubmission;
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

  adminKycRouter.put(
    "/:username/approve",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawUsername = request.params.username;
      const username = Array.isArray(rawUsername) ? rawUsername[0] ?? "" : rawUsername ?? "";

      try {
        const approveKycResponse = await approveUserKycHandler({
          username
        });

        console.info(`KYC approved for "${username.trim()}".`);

        response.json(approveKycResponse);
      } catch (error) {
        if (error instanceof ApproveUserKycValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ApproveUserKycNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ApproveUserKycConflictError) {
          console.warn(`KYC approval conflict for "${username.trim()}".`);

          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminKycRouter.get(
    "/:username",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawUsername = request.params.username;
      const username = Array.isArray(rawUsername) ? rawUsername[0] ?? "" : rawUsername ?? "";

      try {
        const userKycResponse = await getUserKycSubmissionHandler(username);

        response.json(userKycResponse);
      } catch (error) {
        if (error instanceof UserKycSubmissionValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof UserKycSubmissionNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof UserKycSubmissionConflictError) {
          response.status(409).json({
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
