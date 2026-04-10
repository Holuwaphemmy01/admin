import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  getAdminAnalyticsTopSellers,
  AdminAnalyticsTopSellersValidationError,
  getAdminAnalyticsRevenue,
  AdminAnalyticsRevenueValidationError,
  getAdminAnalyticsOverview,
  AdminAnalyticsOverviewValidationError
} from "./service";
import {
  AdminAnalyticsOverviewPeriod,
  AdminAnalyticsRevenueFilters,
  AdminAnalyticsRevenueGroupBy,
  AdminAnalyticsRevenueResponse,
  AdminAnalyticsTopSellersFilters,
  AdminAnalyticsTopSellersPeriod,
  AdminAnalyticsTopSellersResponse
} from "./types";

interface AdminAnalyticsRouterDependencies {
  getAdminAnalyticsTopSellersHandler?: typeof getAdminAnalyticsTopSellers;
  getAdminAnalyticsRevenueHandler?: typeof getAdminAnalyticsRevenue;
  getAdminAnalyticsOverviewHandler?: typeof getAdminAnalyticsOverview;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

class AdminAnalyticsQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAnalyticsQueryValidationError";
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

function parseOverviewPeriod(value: string): AdminAnalyticsOverviewPeriod {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue !== "daily" &&
    normalizedValue !== "weekly" &&
    normalizedValue !== "monthly" &&
    normalizedValue !== "all_time"
  ) {
    throw new AdminAnalyticsQueryValidationError(
      "period must be one of daily, weekly, monthly, all_time"
    );
  }

  return normalizedValue;
}

function parseRevenueGroupBy(value: string): AdminAnalyticsRevenueGroupBy {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue !== "category" &&
    normalizedValue !== "tier" &&
    normalizedValue !== "period"
  ) {
    throw new AdminAnalyticsQueryValidationError(
      "groupBy must be one of category, tier, period"
    );
  }

  return normalizedValue;
}

function parseTopSellersPeriod(value: string): AdminAnalyticsTopSellersPeriod {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue !== "daily" &&
    normalizedValue !== "weekly" &&
    normalizedValue !== "monthly"
  ) {
    throw new AdminAnalyticsQueryValidationError(
      "period must be one of daily, weekly, monthly"
    );
  }

  return normalizedValue;
}

function parsePositiveInteger(value: string, fieldName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new AdminAnalyticsQueryValidationError(`${fieldName} must be a positive integer`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminAnalyticsQueryValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function parseIsoDate(value: string, fieldName: "from" | "to"): Date {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AdminAnalyticsQueryValidationError(
      `${fieldName} must be a valid ISO 8601 datetime`
    );
  }

  return parsedDate;
}

export function createAdminAnalyticsRouter(
  dependencies: AdminAnalyticsRouterDependencies = {}
): Router {
  const adminAnalyticsRouter = Router();
  const getAdminAnalyticsTopSellersHandler =
    dependencies.getAdminAnalyticsTopSellersHandler ?? getAdminAnalyticsTopSellers;
  const getAdminAnalyticsRevenueHandler =
    dependencies.getAdminAnalyticsRevenueHandler ?? getAdminAnalyticsRevenue;
  const getAdminAnalyticsOverviewHandler =
    dependencies.getAdminAnalyticsOverviewHandler ?? getAdminAnalyticsOverview;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminAnalyticsRouter.get(
    "/overview",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const periodQuery = readSingleQueryValue(request.query.period);
        let period: AdminAnalyticsOverviewPeriod | undefined;

        if (typeof periodQuery === "string" && periodQuery !== "") {
          period = parseOverviewPeriod(periodQuery);
        } else if (periodQuery === "") {
          throw new AdminAnalyticsQueryValidationError(
            "period must be one of daily, weekly, monthly, all_time"
          );
        }

        const overviewResponse = await getAdminAnalyticsOverviewHandler(period);

        response.json(overviewResponse);
      } catch (error) {
        if (
          error instanceof AdminAnalyticsQueryValidationError ||
          error instanceof AdminAnalyticsOverviewValidationError
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

  adminAnalyticsRouter.get(
    "/top_sellers",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const limitQuery = readSingleQueryValue(request.query.limit);
        const periodQuery = readSingleQueryValue(request.query.period);
        const filters: AdminAnalyticsTopSellersFilters = {};

        if (typeof limitQuery === "string" && limitQuery !== "") {
          filters.limit = parsePositiveInteger(limitQuery, "limit");
        } else if (limitQuery === "") {
          throw new AdminAnalyticsQueryValidationError("limit must be a positive integer");
        }

        if (typeof periodQuery === "string" && periodQuery !== "") {
          filters.period = parseTopSellersPeriod(periodQuery);
        } else if (periodQuery === "") {
          throw new AdminAnalyticsQueryValidationError(
            "period must be one of daily, weekly, monthly"
          );
        }

        const topSellersResponse: AdminAnalyticsTopSellersResponse =
          await getAdminAnalyticsTopSellersHandler(filters);

        response.json(topSellersResponse);
      } catch (error) {
        if (
          error instanceof AdminAnalyticsQueryValidationError ||
          error instanceof AdminAnalyticsTopSellersValidationError
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

  adminAnalyticsRouter.get(
    "/revenue",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const groupByQuery = readSingleQueryValue(request.query.groupBy);
        const fromQuery = readSingleQueryValue(request.query.from);
        const toQuery = readSingleQueryValue(request.query.to);
        const filters: AdminAnalyticsRevenueFilters = {};

        if (typeof groupByQuery === "string" && groupByQuery !== "") {
          filters.groupBy = parseRevenueGroupBy(groupByQuery);
        } else if (groupByQuery === "") {
          throw new AdminAnalyticsQueryValidationError(
            "groupBy must be one of category, tier, period"
          );
        }

        if (typeof fromQuery === "string" && fromQuery !== "") {
          filters.from = parseIsoDate(fromQuery, "from");
        } else if (fromQuery === "") {
          throw new AdminAnalyticsQueryValidationError(
            "from must be a valid ISO 8601 datetime"
          );
        }

        if (typeof toQuery === "string" && toQuery !== "") {
          filters.to = parseIsoDate(toQuery, "to");
        } else if (toQuery === "") {
          throw new AdminAnalyticsQueryValidationError(
            "to must be a valid ISO 8601 datetime"
          );
        }

        const revenueResponse: AdminAnalyticsRevenueResponse =
          await getAdminAnalyticsRevenueHandler(filters);

        response.json(revenueResponse);
      } catch (error) {
        if (
          error instanceof AdminAnalyticsQueryValidationError ||
          error instanceof AdminAnalyticsRevenueValidationError
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

  return adminAnalyticsRouter;
}

const adminAnalyticsRouter = createAdminAnalyticsRouter();

export default adminAnalyticsRouter;
