import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  DEFAULT_ADMIN_CAMPAIGNS_LIMIT,
  DEFAULT_ADMIN_CAMPAIGNS_PAGE,
  MAX_ADMIN_CAMPAIGNS_LIMIT,
  AdminCampaignStatusFilter,
  AdminCampaignsListFilters
} from "./types";
import {
  AdminCampaignNotFoundError,
  AdminCampaignsValidationError,
  getAdminCampaignDetails,
  listAdminCampaigns
} from "./service";

interface AdminCampaignsRouterDependencies {
  getAdminCampaignDetailsHandler?: typeof getAdminCampaignDetails;
  listAdminCampaignsHandler?: typeof listAdminCampaigns;
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

export function createAdminCampaignsRouter(
  dependencies: AdminCampaignsRouterDependencies = {}
): Router {
  const adminCampaignsRouter = Router();
  const getAdminCampaignDetailsHandler =
    dependencies.getAdminCampaignDetailsHandler ?? getAdminCampaignDetails;
  const listAdminCampaignsHandler =
    dependencies.listAdminCampaignsHandler ?? listAdminCampaigns;
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
