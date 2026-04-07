import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import { listAdminAccounts } from "./service";

interface AdminAccountsRouterDependencies {
  listAdminAccountsHandler?: typeof listAdminAccounts;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

export function createAdminAccountsRouter(
  dependencies: AdminAccountsRouterDependencies = {}
): Router {
  const adminAccountsRouter = Router();
  const listAdminAccountsHandler = dependencies.listAdminAccountsHandler ?? listAdminAccounts;
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

  return adminAccountsRouter;
}

const adminAccountsRouter = createAdminAccountsRouter();

export default adminAccountsRouter;
