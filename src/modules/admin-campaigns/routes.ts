import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  AdminCampaignAnalyticsFilters,
  DEFAULT_ADMIN_CAMPAIGNS_LIMIT,
  DEFAULT_ADMIN_CAMPAIGNS_PAGE,
  MAX_ADMIN_CAMPAIGNS_LIMIT,
  AdminCampaignStatusFilter,
  AdminCampaignsListFilters
} from "./types";
import {
  AdminCampaignNotFoundError,
  AdminCampaignApprovalConflictError,
  AdminCampaignPauseConflictError,
  AdminCampaignRejectionConflictError,
  AdminCampaignsValidationError,
  approveAdminCampaign,
  getAdminCampaignAnalytics,
  getAdminCampaignDetails,
  listAdminCampaigns,
  pauseAdminCampaign,
  rejectAdminCampaign
} from "./service";

interface AdminCampaignsRouterDependencies {
  approveAdminCampaignHandler?: typeof approveAdminCampaign;
  getAdminCampaignAnalyticsHandler?: typeof getAdminCampaignAnalytics;
  getAdminCampaignDetailsHandler?: typeof getAdminCampaignDetails;
  listAdminCampaignsHandler?: typeof listAdminCampaigns;
  pauseAdminCampaignHandler?: typeof pauseAdminCampaign;
  rejectAdminCampaignHandler?: typeof rejectAdminCampaign;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

class AdminCampaignsQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminCampaignsQueryValidationError";
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
    throw new AdminCampaignsQueryValidationError(`${fieldName} must be a positive integer`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminCampaignsQueryValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function parseCampaignStatus(value: string): AdminCampaignStatusFilter {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue !== "draft" &&
    normalizedValue !== "pending_approval" &&
    normalizedValue !== "active" &&
    normalizedValue !== "paused" &&
    normalizedValue !== "completed" &&
    normalizedValue !== "rejected"
  ) {
    throw new AdminCampaignsQueryValidationError(
      "status must be one of draft, pending_approval, active, paused, completed, rejected"
    );
  }

  return normalizedValue;
}

function parseIsoDate(value: string, fieldName: string): Date {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AdminCampaignsQueryValidationError(`${fieldName} must be a valid ISO 8601 datetime`);
  }

  return parsedDate;
}

export function createAdminCampaignsRouter(
  dependencies: AdminCampaignsRouterDependencies = {}
): Router {
  const adminCampaignsRouter = Router();
  const approveAdminCampaignHandler =
    dependencies.approveAdminCampaignHandler ?? approveAdminCampaign;
  const getAdminCampaignAnalyticsHandler =
    dependencies.getAdminCampaignAnalyticsHandler ?? getAdminCampaignAnalytics;
  const getAdminCampaignDetailsHandler =
    dependencies.getAdminCampaignDetailsHandler ?? getAdminCampaignDetails;
  const listAdminCampaignsHandler =
    dependencies.listAdminCampaignsHandler ?? listAdminCampaigns;
  const pauseAdminCampaignHandler =
    dependencies.pauseAdminCampaignHandler ?? pauseAdminCampaign;
  const rejectAdminCampaignHandler =
    dependencies.rejectAdminCampaignHandler ?? rejectAdminCampaign;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminCampaignsRouter.get(
    "/",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const statusQuery = readSingleQueryValue(request.query.status);
        const usernameQuery = readSingleQueryValue(request.query.username);
        const pageQuery = readSingleQueryValue(request.query.page);
        const limitQuery = readSingleQueryValue(request.query.limit);

        const filters: AdminCampaignsListFilters = {
          page: DEFAULT_ADMIN_CAMPAIGNS_PAGE,
          limit: DEFAULT_ADMIN_CAMPAIGNS_LIMIT
        };

        if (typeof statusQuery === "string" && statusQuery !== "") {
          filters.status = parseCampaignStatus(statusQuery);
        } else if (statusQuery === "") {
          throw new AdminCampaignsQueryValidationError(
            "status must be one of draft, pending_approval, active, paused, completed, rejected"
          );
        }

        if (typeof usernameQuery === "string" && usernameQuery !== "") {
          filters.username = usernameQuery;
        } else if (usernameQuery === "") {
          throw new AdminCampaignsQueryValidationError(
            "username must be a non-empty string when provided"
          );
        }

        if (typeof pageQuery === "string" && pageQuery !== "") {
          filters.page = parsePositiveInteger(pageQuery, "page");
        } else if (pageQuery === "") {
          throw new AdminCampaignsQueryValidationError("page must be a positive integer");
        }

        if (typeof limitQuery === "string" && limitQuery !== "") {
          const parsedLimit = parsePositiveInteger(limitQuery, "limit");
          filters.limit = Math.min(parsedLimit, MAX_ADMIN_CAMPAIGNS_LIMIT);
        } else if (limitQuery === "") {
          throw new AdminCampaignsQueryValidationError("limit must be a positive integer");
        }

        const campaignsResponse = await listAdminCampaignsHandler(filters);

        response.json(campaignsResponse);
      } catch (error) {
        if (
          error instanceof AdminCampaignsQueryValidationError ||
          error instanceof AdminCampaignsValidationError
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

  adminCampaignsRouter.put(
    "/:campaignId/approve",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawCampaignId = request.params.campaignId;
      const campaignId = (
        Array.isArray(rawCampaignId) ? rawCampaignId[0] ?? "" : rawCampaignId ?? ""
      ).trim();
      const body = (request.body ?? {}) as {
        note?: unknown;
      };

      if (!/^\d+$/.test(campaignId) || Number(campaignId) <= 0) {
        response.status(400).json({
          message: "campaignId must be a positive integer"
        });

        return;
      }

      if (body.note !== undefined && (typeof body.note !== "string" || body.note.trim() === "")) {
        response.status(400).json({
          message: "note must be a non-empty string when provided"
        });

        return;
      }

      try {
        const approveResponse = await approveAdminCampaignHandler(Number(campaignId), {
          ...(typeof body.note === "string" ? { note: body.note.trim() } : {})
        });

        response.json(approveResponse);
      } catch (error) {
        if (error instanceof AdminCampaignsValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminCampaignNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminCampaignApprovalConflictError) {
          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminCampaignsRouter.put(
    "/:campaignId/pause",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawCampaignId = request.params.campaignId;
      const campaignId = (
        Array.isArray(rawCampaignId) ? rawCampaignId[0] ?? "" : rawCampaignId ?? ""
      ).trim();
      const body = (request.body ?? {}) as {
        reason?: unknown;
      };

      if (!/^\d+$/.test(campaignId) || Number(campaignId) <= 0) {
        response.status(400).json({
          message: "campaignId must be a positive integer"
        });

        return;
      }

      if (
        body.reason !== undefined &&
        (typeof body.reason !== "string" || body.reason.trim() === "")
      ) {
        response.status(400).json({
          message: "reason must be a non-empty string when provided"
        });

        return;
      }

      try {
        const pauseResponse = await pauseAdminCampaignHandler(Number(campaignId), {
          ...(typeof body.reason === "string" ? { reason: body.reason.trim() } : {})
        });

        response.json(pauseResponse);
      } catch (error) {
        if (error instanceof AdminCampaignsValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminCampaignNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminCampaignPauseConflictError) {
          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminCampaignsRouter.put(
    "/:campaignId/reject",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawCampaignId = request.params.campaignId;
      const campaignId = (
        Array.isArray(rawCampaignId) ? rawCampaignId[0] ?? "" : rawCampaignId ?? ""
      ).trim();
      const body = (request.body ?? {}) as {
        reason?: unknown;
      };

      if (!/^\d+$/.test(campaignId) || Number(campaignId) <= 0) {
        response.status(400).json({
          message: "campaignId must be a positive integer"
        });

        return;
      }

      if (typeof body.reason !== "string" || body.reason.trim() === "") {
        response.status(400).json({
          message: "reason is required and must be a non-empty string"
        });

        return;
      }

      try {
        const rejectResponse = await rejectAdminCampaignHandler(Number(campaignId), {
          reason: body.reason.trim(),
          actedByAdminUserId: request.admin?.sub ?? ""
        });

        response.json(rejectResponse);
      } catch (error) {
        if (error instanceof AdminCampaignsValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminCampaignNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminCampaignRejectionConflictError) {
          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminCampaignsRouter.get(
    "/analytics",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const fromQuery = readSingleQueryValue(request.query.from);
        const toQuery = readSingleQueryValue(request.query.to);

        const filters: AdminCampaignAnalyticsFilters = {};

        if (typeof fromQuery === "string" && fromQuery !== "") {
          filters.from = parseIsoDate(fromQuery, "from");
        } else if (fromQuery === "") {
          throw new AdminCampaignsQueryValidationError("from must be a valid ISO 8601 datetime");
        }

        if (typeof toQuery === "string" && toQuery !== "") {
          filters.to = parseIsoDate(toQuery, "to");
        } else if (toQuery === "") {
          throw new AdminCampaignsQueryValidationError("to must be a valid ISO 8601 datetime");
        }

        if (filters.from && filters.to && filters.from > filters.to) {
          throw new AdminCampaignsQueryValidationError("from must be less than or equal to to");
        }

        const analyticsResponse = await getAdminCampaignAnalyticsHandler(filters);

        response.json(analyticsResponse);
      } catch (error) {
        if (
          error instanceof AdminCampaignsQueryValidationError ||
          error instanceof AdminCampaignsValidationError
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

  adminCampaignsRouter.get(
    "/:campaignId",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawCampaignId = request.params.campaignId;
      const campaignId = (
        Array.isArray(rawCampaignId) ? rawCampaignId[0] ?? "" : rawCampaignId ?? ""
      ).trim();

      if (!/^\d+$/.test(campaignId) || Number(campaignId) <= 0) {
        response.status(400).json({
          message: "campaignId must be a positive integer"
        });

        return;
      }

      try {
        const campaignResponse = await getAdminCampaignDetailsHandler(Number(campaignId));

        response.json(campaignResponse);
      } catch (error) {
        if (error instanceof AdminCampaignsValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminCampaignNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminCampaignsRouter;
}

const adminCampaignsRouter = createAdminCampaignsRouter();

export default adminCampaignsRouter;
