import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  DEFAULT_ADMIN_TRANSACTIONS_LIMIT,
  DEFAULT_ADMIN_TRANSACTIONS_PAGE,
  MAX_ADMIN_TRANSACTIONS_LIMIT,
  AdminTransactionType,
  AdminTransactionsListFilters
} from "./types";
import {
  AdminTransactionConflictError,
  AdminTransactionNotFoundError,
  AdminTransactionsValidationError,
  getAdminTransactionDetails,
  listAdminTransactions
} from "./service";

interface AdminTransactionsRouterDependencies {
  getAdminTransactionDetailsHandler?: typeof getAdminTransactionDetails;
  listAdminTransactionsHandler?: typeof listAdminTransactions;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

class AdminTransactionsQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminTransactionsQueryValidationError";
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
    throw new AdminTransactionsQueryValidationError(`${fieldName} must be a positive integer`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminTransactionsQueryValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function parseIsoDate(value: string, fieldName: string): Date {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AdminTransactionsQueryValidationError(`${fieldName} must be a valid ISO 8601 datetime`);
  }

  return parsedDate;
}

function parseTransactionType(value: string): AdminTransactionType {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue !== "credit" && normalizedValue !== "debit") {
    throw new AdminTransactionsQueryValidationError(
      "transactionType must be one of credit or debit"
    );
  }

  return normalizedValue;
}

export function createAdminTransactionsRouter(
  dependencies: AdminTransactionsRouterDependencies = {}
): Router {
  const adminTransactionsRouter = Router();
  const getAdminTransactionDetailsHandler =
    dependencies.getAdminTransactionDetailsHandler ?? getAdminTransactionDetails;
  const listAdminTransactionsHandler =
    dependencies.listAdminTransactionsHandler ?? listAdminTransactions;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminTransactionsRouter.get(
    "/",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const userIdQuery = readSingleQueryValue(request.query.userId);
        const transactionTypeQuery = readSingleQueryValue(request.query.transactionType);
        const fromQuery = readSingleQueryValue(request.query.from);
        const toQuery = readSingleQueryValue(request.query.to);
        const pageQuery = readSingleQueryValue(request.query.page);
        const limitQuery = readSingleQueryValue(request.query.limit);

        const filters: AdminTransactionsListFilters = {
          page: DEFAULT_ADMIN_TRANSACTIONS_PAGE,
          limit: DEFAULT_ADMIN_TRANSACTIONS_LIMIT
        };

        if (typeof userIdQuery === "string" && userIdQuery !== "") {
          filters.userId = parsePositiveInteger(userIdQuery, "userId");
        } else if (userIdQuery === "") {
          throw new AdminTransactionsQueryValidationError("userId must be a positive integer");
        }

        if (typeof transactionTypeQuery === "string" && transactionTypeQuery !== "") {
          filters.transactionType = parseTransactionType(transactionTypeQuery);
        } else if (transactionTypeQuery === "") {
          throw new AdminTransactionsQueryValidationError(
            "transactionType must be one of credit or debit"
          );
        }

        if (typeof fromQuery === "string" && fromQuery !== "") {
          filters.from = parseIsoDate(fromQuery, "from");
        } else if (fromQuery === "") {
          throw new AdminTransactionsQueryValidationError("from must be a valid ISO 8601 datetime");
        }

        if (typeof toQuery === "string" && toQuery !== "") {
          filters.to = parseIsoDate(toQuery, "to");
        } else if (toQuery === "") {
          throw new AdminTransactionsQueryValidationError("to must be a valid ISO 8601 datetime");
        }

        if (typeof pageQuery === "string" && pageQuery !== "") {
          filters.page = parsePositiveInteger(pageQuery, "page");
        } else if (pageQuery === "") {
          throw new AdminTransactionsQueryValidationError("page must be a positive integer");
        }

        if (typeof limitQuery === "string" && limitQuery !== "") {
          const parsedLimit = parsePositiveInteger(limitQuery, "limit");
          filters.limit = Math.min(parsedLimit, MAX_ADMIN_TRANSACTIONS_LIMIT);
        } else if (limitQuery === "") {
          throw new AdminTransactionsQueryValidationError("limit must be a positive integer");
        }

        if (filters.from && filters.to && filters.from > filters.to) {
          throw new AdminTransactionsQueryValidationError("from must be less than or equal to to");
        }

        const transactionsResponse = await listAdminTransactionsHandler(filters);

        response.json(transactionsResponse);
      } catch (error) {
        if (
          error instanceof AdminTransactionsQueryValidationError ||
          error instanceof AdminTransactionsValidationError
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

  adminTransactionsRouter.get(
    "/:transactionId",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawTransactionId = request.params.transactionId;
      const transactionId = (
        Array.isArray(rawTransactionId) ? rawTransactionId[0] ?? "" : rawTransactionId ?? ""
      ).trim();

      if (transactionId === "") {
        response.status(400).json({
          message: "transactionId must be a non-empty string"
        });

        return;
      }

      try {
        const transactionResponse = await getAdminTransactionDetailsHandler(transactionId);

        response.json(transactionResponse);
      } catch (error) {
        if (error instanceof AdminTransactionsValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminTransactionNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminTransactionConflictError) {
          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminTransactionsRouter;
}

const adminTransactionsRouter = createAdminTransactionsRouter();

export default adminTransactionsRouter;
