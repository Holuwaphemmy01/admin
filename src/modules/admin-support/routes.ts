import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  DEFAULT_ADMIN_SUPPORT_TICKETS_LIMIT,
  DEFAULT_ADMIN_SUPPORT_TICKETS_PAGE,
  MAX_ADMIN_SUPPORT_TICKETS_LIMIT,
  AdminSupportTicketStatusFilter,
  AdminSupportTicketsListFilters,
  ReplyToAdminSupportTicketRequest
} from "./types";
import {
  AdminSupportTicketNotFoundError,
  AdminSupportTicketsValidationError,
  getAdminSupportTicketDetails,
  listAdminSupportTickets,
  replyToAdminSupportTicket
} from "./service";

interface AdminSupportRouterDependencies {
  getAdminSupportTicketDetailsHandler?: typeof getAdminSupportTicketDetails;
  listAdminSupportTicketsHandler?: typeof listAdminSupportTickets;
  replyToAdminSupportTicketHandler?: typeof replyToAdminSupportTicket;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

class AdminSupportQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSupportQueryValidationError";
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

function readSingleBodyValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim();
}

function parsePositiveInteger(value: string, fieldName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new AdminSupportQueryValidationError(`${fieldName} must be a positive integer`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminSupportQueryValidationError(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function parseTicketStatus(value: string): AdminSupportTicketStatusFilter {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue !== "open" &&
    normalizedValue !== "closed" &&
    normalizedValue !== "pending"
  ) {
    throw new AdminSupportQueryValidationError(
      "status must be one of open, closed, pending"
    );
  }

  return normalizedValue;
}

function parseBodyTicketId(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) {
      throw new AdminSupportQueryValidationError(
        "ticketId is required and must be a positive integer"
      );
    }

    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();

    if (normalizedValue === "") {
      throw new AdminSupportQueryValidationError(
        "ticketId is required and must be a positive integer"
      );
    }

    return parsePositiveInteger(normalizedValue, "ticketId");
  }

  throw new AdminSupportQueryValidationError(
    "ticketId is required and must be a positive integer"
  );
}

export function createAdminSupportRouter(
  dependencies: AdminSupportRouterDependencies = {}
): Router {
  const adminSupportRouter = Router();
  const getAdminSupportTicketDetailsHandler =
    dependencies.getAdminSupportTicketDetailsHandler ?? getAdminSupportTicketDetails;
  const listAdminSupportTicketsHandler =
    dependencies.listAdminSupportTicketsHandler ?? listAdminSupportTickets;
  const replyToAdminSupportTicketHandler =
    dependencies.replyToAdminSupportTicketHandler ?? replyToAdminSupportTicket;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminSupportRouter.post(
    "/tickets/:ticketId/reply",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawTicketId = request.params.ticketId;
      const ticketId = (
        Array.isArray(rawTicketId) ? rawTicketId[0] ?? "" : rawTicketId ?? ""
      ).trim();

      if (!/^\d+$/.test(ticketId) || Number(ticketId) <= 0) {
        response.status(400).json({
          message: "ticketId must be a positive integer"
        });

        return;
      }

      try {
        const body =
          typeof request.body === "object" && request.body !== null
            ? (request.body as Record<string, unknown>)
            : {};
        const bodyTicketId = parseBodyTicketId(body.ticketId);
        const message = readSingleBodyValue(body.message);
        const attachmentFileType = readSingleBodyValue(body.attachmentFileType);

        if (bodyTicketId !== Number(ticketId)) {
          throw new AdminSupportQueryValidationError(
            "ticketId in request body must match the path ticketId"
          );
        }

        if (typeof message !== "string" || message === "") {
          throw new AdminSupportQueryValidationError(
            "message is required and must be a non-empty string"
          );
        }

        const payload: ReplyToAdminSupportTicketRequest = {
          ticketId: bodyTicketId,
          message
        };

        if (body.attachmentFileType !== undefined) {
          if (typeof attachmentFileType !== "string" || attachmentFileType === "") {
            throw new AdminSupportQueryValidationError(
              "attachmentFileType must be a non-empty string when provided"
            );
          }

          payload.attachmentFileType = attachmentFileType;
        }

        const replyResponse = await replyToAdminSupportTicketHandler(payload);

        response.json(replyResponse);
      } catch (error) {
        if (
          error instanceof AdminSupportQueryValidationError ||
          error instanceof AdminSupportTicketsValidationError
        ) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSupportTicketNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminSupportRouter.get(
    "/tickets/:ticketId",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawTicketId = request.params.ticketId;
      const ticketId = (
        Array.isArray(rawTicketId) ? rawTicketId[0] ?? "" : rawTicketId ?? ""
      ).trim();

      if (!/^\d+$/.test(ticketId) || Number(ticketId) <= 0) {
        response.status(400).json({
          message: "ticketId must be a positive integer"
        });

        return;
      }

      try {
        const ticketResponse = await getAdminSupportTicketDetailsHandler(Number(ticketId));

        response.json(ticketResponse);
      } catch (error) {
        if (error instanceof AdminSupportTicketsValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminSupportTicketNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminSupportRouter.get(
    "/tickets",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      try {
        const statusQuery = readSingleQueryValue(request.query.status);
        const usernameQuery = readSingleQueryValue(request.query.username);
        const categoryIdQuery = readSingleQueryValue(request.query.categoryId);
        const pageQuery = readSingleQueryValue(request.query.page);
        const limitQuery = readSingleQueryValue(request.query.limit);

        const filters: AdminSupportTicketsListFilters = {
          page: DEFAULT_ADMIN_SUPPORT_TICKETS_PAGE,
          limit: DEFAULT_ADMIN_SUPPORT_TICKETS_LIMIT
        };

        if (typeof statusQuery === "string" && statusQuery !== "") {
          filters.status = parseTicketStatus(statusQuery);
        } else if (statusQuery === "") {
          throw new AdminSupportQueryValidationError(
            "status must be one of open, closed, pending"
          );
        }

        if (typeof usernameQuery === "string" && usernameQuery !== "") {
          filters.username = usernameQuery;
        } else if (usernameQuery === "") {
          throw new AdminSupportQueryValidationError(
            "username must be a non-empty string when provided"
          );
        }

        if (typeof categoryIdQuery === "string" && categoryIdQuery !== "") {
          filters.categoryId = parsePositiveInteger(categoryIdQuery, "categoryId");
        } else if (categoryIdQuery === "") {
          throw new AdminSupportQueryValidationError("categoryId must be a positive integer");
        }

        if (typeof pageQuery === "string" && pageQuery !== "") {
          filters.page = parsePositiveInteger(pageQuery, "page");
        } else if (pageQuery === "") {
          throw new AdminSupportQueryValidationError("page must be a positive integer");
        }

        if (typeof limitQuery === "string" && limitQuery !== "") {
          const parsedLimit = parsePositiveInteger(limitQuery, "limit");
          filters.limit = Math.min(parsedLimit, MAX_ADMIN_SUPPORT_TICKETS_LIMIT);
        } else if (limitQuery === "") {
          throw new AdminSupportQueryValidationError("limit must be a positive integer");
        }

        const ticketsResponse = await listAdminSupportTicketsHandler(filters);

        response.json(ticketsResponse);
      } catch (error) {
        if (
          error instanceof AdminSupportQueryValidationError ||
          error instanceof AdminSupportTicketsValidationError
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

  return adminSupportRouter;
}

const adminSupportRouter = createAdminSupportRouter();

export default adminSupportRouter;
