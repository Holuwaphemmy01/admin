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
  AdminSettlementApprovalConflictError,
  AdminSettlementApprovalNotFoundError,
  AdminSettlementRejectionConflictError,
  AdminSettlementRejectionNotFoundError,
  AdminSettlementsValidationError,
  approveAdminSettlement,
  getAdminSettlementsStats,
  rejectAdminSettlement,
  listAdminSettlements
} from "./service";

interface AdminSettlementsRouterDependencies {
  approveAdminSettlementHandler?: typeof approveAdminSettlement;
  getAdminSettlementsStatsHandler?: typeof getAdminSettlementsStats;
  rejectAdminSettlementHandler?: typeof rejectAdminSettlement;
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
  const approveAdminSettlementHandler =
    dependencies.approveAdminSettlementHandler ?? approveAdminSettlement;
  const getAdminSettlementsStatsHandler =
    dependencies.getAdminSettlementsStatsHandler ?? getAdminSettlementsStats;
  const rejectAdminSettlementHandler =
    dependencies.rejectAdminSettlementHandler ?? rejectAdminSettlement;
  const listAdminSettlementsHandler =
    dependencies.listAdminSettlementsHandler ?? listAdminSettlements;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminSettlementsRouter.get(
    "/stats",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (_request: Request, response: Response, next) => {
      try {
        const statsResponse = await getAdminSettlementsStatsHandler();

        response.json(statsResponse);
      } catch (error) {
        next(error);
      }
    }
  );

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

  adminSettlementsRouter.put(
    "/:id/approve",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawId = request.params.id;
      const idText = (Array.isArray(rawId) ? rawId[0] ?? "" : rawId ?? "").trim();

      if (!/^\d+$/.test(idText)) {
        response.status(400).json({
          message: "id must be a positive integer"
        });

        return;
      }

      const body = request.body as {
        username?: unknown;
        amount?: unknown;
        description?: unknown;
        settlementAccountId?: unknown;
      };
      const rawUsername = typeof body.username === "string" ? body.username.trim() : "";
      const rawAmount = body.amount;
      const rawDescription =
        typeof body.description === "string" ? body.description.trim() : "";
      const rawSettlementAccountId = body.settlementAccountId;

      if (rawUsername === "") {
        response.status(400).json({
          message: "username must be a non-empty string"
        });

        return;
      }

      if (
        typeof rawAmount !== "number" ||
        !Number.isFinite(rawAmount) ||
        rawAmount <= 0 ||
        Math.abs(rawAmount - Number(rawAmount.toFixed(2))) > Number.EPSILON
      ) {
        response.status(400).json({
          message: "amount must be a positive finite number with at most 2 decimal places"
        });

        return;
      }

      if (rawDescription === "") {
        response.status(400).json({
          message: "description must be a non-empty string"
        });

        return;
      }

      if (
        typeof rawSettlementAccountId !== "number" ||
        !Number.isInteger(rawSettlementAccountId) ||
        rawSettlementAccountId <= 0
      ) {
        response.status(400).json({
          message: "settlementAccountId must be a positive integer"
        });

        return;
      }

      try {
        const settlementResponse = await approveAdminSettlementHandler(Number(idText), {
          username: rawUsername,
          amount: rawAmount,
          description: rawDescription,
          settlementAccountId: rawSettlementAccountId,
          actedByAdminUserId: request.admin?.sub ?? ""
        });

        response.json(settlementResponse);
      } catch (error) {
        if (error instanceof AdminSettlementsValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSettlementApprovalNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSettlementApprovalConflictError) {
          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminSettlementsRouter.put(
    "/:id/reject",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawId = request.params.id;
      const idText = (Array.isArray(rawId) ? rawId[0] ?? "" : rawId ?? "").trim();

      if (!/^\d+$/.test(idText)) {
        response.status(400).json({
          message: "id must be a positive integer"
        });

        return;
      }

      const body = request.body as {
        reason?: unknown;
      };
      const rawReason = typeof body.reason === "string" ? body.reason.trim() : "";

      if (rawReason === "") {
        response.status(400).json({
          message: "reason must be a non-empty string"
        });

        return;
      }

      try {
        const settlementResponse = await rejectAdminSettlementHandler(Number(idText), {
          reason: rawReason,
          actedByAdminUserId: request.admin?.sub ?? ""
        });

        response.json(settlementResponse);
      } catch (error) {
        if (error instanceof AdminSettlementsValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSettlementRejectionNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSettlementRejectionConflictError) {
          response.status(409).json({
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
