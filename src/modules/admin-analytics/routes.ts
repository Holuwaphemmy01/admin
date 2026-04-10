import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  getAdminAnalyticsOverview,
  AdminAnalyticsOverviewValidationError
} from "./service";
import { AdminAnalyticsOverviewPeriod } from "./types";

interface AdminAnalyticsRouterDependencies {
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

export function createAdminAnalyticsRouter(
  dependencies: AdminAnalyticsRouterDependencies = {}
): Router {
  const adminAnalyticsRouter = Router();
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

  return adminAnalyticsRouter;
}

const adminAnalyticsRouter = createAdminAnalyticsRouter();

export default adminAnalyticsRouter;
