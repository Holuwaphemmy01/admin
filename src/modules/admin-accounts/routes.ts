import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  AdminAccountConflictError,
  AdminAccountNotFoundError,
  AdminAccountValidationError,
  listAdminAccounts,
  revokeAdminAccess
} from "./service";

interface AdminAccountsRouterDependencies {
  listAdminAccountsHandler?: typeof listAdminAccounts;
  revokeAdminAccessHandler?: typeof revokeAdminAccess;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

function isValidUuidParameter(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function createAdminAccountsRouter(
  dependencies: AdminAccountsRouterDependencies = {}
): Router {
  const adminAccountsRouter = Router();
  const listAdminAccountsHandler = dependencies.listAdminAccountsHandler ?? listAdminAccounts;
  const revokeAdminAccessHandler = dependencies.revokeAdminAccessHandler ?? revokeAdminAccess;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminAccountsRouter.get(
    "/admins",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (_request: Request, response: Response, next) => {
      try {
        const adminAccounts = await listAdminAccountsHandler();

        response.json(adminAccounts);
      } catch (error) {
        next(error);
      }
    }
  );

  adminAccountsRouter.put(
    "/admins/:id/revoke",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawId = request.params.id;
      const id = Array.isArray(rawId) ? rawId[0] ?? "" : rawId ?? "";
      const { reason } = request.body ?? {};

      if (!isValidUuidParameter(id)) {
        response.status(400).json({
          message: "id must be a valid UUID"
        });

        return;
      }

      if (reason !== undefined && (typeof reason !== "string" || reason.trim() === "")) {
        response.status(400).json({
          message: "reason must be a non-empty string when provided"
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
        const revokeResponse = await revokeAdminAccessHandler({
          targetAdminId: id,
          reason,
          revokedByAdmin: request.admin
        });

        console.info(`Admin access revoked for "${id}" by "${request.admin.username}".`);

        response.json(revokeResponse);
      } catch (error) {
        if (error instanceof AdminAccountValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminAccountNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminAccountConflictError) {
          console.warn(`Admin revoke conflict for "${id}" by "${request.admin.username}".`);

          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminAccountsRouter;
}

const adminAccountsRouter = createAdminAccountsRouter();

export default adminAccountsRouter;
