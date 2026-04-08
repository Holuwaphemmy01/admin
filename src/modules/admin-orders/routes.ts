import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import { AdminOrdersListFilters, DEFAULT_ADMIN_ORDERS_LIMIT, DEFAULT_ADMIN_ORDERS_PAGE, MAX_ADMIN_ORDERS_LIMIT } from "./types";
import {
  AdminOrderNotFoundError,
  AdminOrdersValidationError,
  getOrderDetails,
  listOrders
} from "./service";

interface AdminOrdersRouterDependencies {
  getOrderDetailsHandler?: typeof getOrderDetails;
  listOrdersHandler?: typeof listOrders;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

class AdminOrdersQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrdersQueryValidationError";
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
    throw new AdminOrdersQueryValidationError(`${fieldName} must be a positive integer`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminOrdersQueryValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function parseStatus(value: string): AdminOrdersListFilters["status"] {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue !== "pending" &&
    normalizedValue !== "picked_up" &&
    normalizedValue !== "in_transit" &&
    normalizedValue !== "delivered" &&
    normalizedValue !== "cancelled"
  ) {
    throw new AdminOrdersQueryValidationError(
      "status must be one of pending, picked_up, in_transit, delivered, cancelled"
    );
  }

  return normalizedValue;
}

function parseIsoDate(value: string, fieldName: string): Date {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AdminOrdersQueryValidationError(`${fieldName} must be a valid ISO 8601 datetime`);
  }

  return parsedDate;
}

export function createAdminOrdersRouter(
  dependencies: AdminOrdersRouterDependencies = {}
): Router {
  const adminOrdersRouter = Router();
  const getOrderDetailsHandler = dependencies.getOrderDetailsHandler ?? getOrderDetails;
  const listOrdersHandler = dependencies.listOrdersHandler ?? listOrders;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminOrdersRouter.get(
    "/",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const statusQuery = readSingleQueryValue(request.query.status);
        const sellerUsernameQuery = readSingleQueryValue(request.query.sellerUsername);
        const buyerUsernameQuery = readSingleQueryValue(request.query.buyerUsername);
        const fromQuery = readSingleQueryValue(request.query.from);
        const toQuery = readSingleQueryValue(request.query.to);
        const pageQuery = readSingleQueryValue(request.query.page);
        const limitQuery = readSingleQueryValue(request.query.limit);

        const filters: AdminOrdersListFilters = {
          page: DEFAULT_ADMIN_ORDERS_PAGE,
          limit: DEFAULT_ADMIN_ORDERS_LIMIT
        };

        if (typeof statusQuery === "string" && statusQuery !== "") {
          filters.status = parseStatus(statusQuery);
        } else if (statusQuery === "") {
          throw new AdminOrdersQueryValidationError(
            "status must be one of pending, picked_up, in_transit, delivered, cancelled"
          );
        }

        if (typeof sellerUsernameQuery === "string" && sellerUsernameQuery !== "") {
          filters.sellerUsername = sellerUsernameQuery;
        } else if (sellerUsernameQuery === "") {
          throw new AdminOrdersQueryValidationError(
            "sellerUsername must be a non-empty string when provided"
          );
        }

        if (typeof buyerUsernameQuery === "string" && buyerUsernameQuery !== "") {
          filters.buyerUsername = buyerUsernameQuery;
        } else if (buyerUsernameQuery === "") {
          throw new AdminOrdersQueryValidationError(
            "buyerUsername must be a non-empty string when provided"
          );
        }

        if (typeof fromQuery === "string" && fromQuery !== "") {
          filters.from = parseIsoDate(fromQuery, "from");
        } else if (fromQuery === "") {
          throw new AdminOrdersQueryValidationError("from must be a valid ISO 8601 datetime");
        }

        if (typeof toQuery === "string" && toQuery !== "") {
          filters.to = parseIsoDate(toQuery, "to");
        } else if (toQuery === "") {
          throw new AdminOrdersQueryValidationError("to must be a valid ISO 8601 datetime");
        }

        if (typeof pageQuery === "string" && pageQuery !== "") {
          filters.page = parsePositiveInteger(pageQuery, "page");
        } else if (pageQuery === "") {
          throw new AdminOrdersQueryValidationError("page must be a positive integer");
        }

        if (typeof limitQuery === "string" && limitQuery !== "") {
          const parsedLimit = parsePositiveInteger(limitQuery, "limit");
          filters.limit = Math.min(parsedLimit, MAX_ADMIN_ORDERS_LIMIT);
        } else if (limitQuery === "") {
          throw new AdminOrdersQueryValidationError("limit must be a positive integer");
        }

        if (filters.from && filters.to && filters.from > filters.to) {
          throw new AdminOrdersQueryValidationError("from must be less than or equal to to");
        }

        const ordersResponse = await listOrdersHandler(filters);

        response.json(ordersResponse);
      } catch (error) {
        if (
          error instanceof AdminOrdersQueryValidationError ||
          error instanceof AdminOrdersValidationError
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

  adminOrdersRouter.get(
    "/:orderNumber",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const rawOrderNumber =
          typeof request.params.orderNumber === "string" ? request.params.orderNumber.trim() : "";

        if (rawOrderNumber === "") {
          throw new AdminOrdersQueryValidationError("orderNumber must be a non-empty string");
        }

        const orderResponse = await getOrderDetailsHandler(rawOrderNumber);

        response.json(orderResponse);
      } catch (error) {
        if (
          error instanceof AdminOrdersQueryValidationError ||
          error instanceof AdminOrdersValidationError
        ) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminOrderNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminOrdersRouter;
}

const adminOrdersRouter = createAdminOrdersRouter();

export default adminOrdersRouter;
