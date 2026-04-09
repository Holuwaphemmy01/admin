import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import { listAdminSubscriptions } from "./service";

interface AdminSubscriptionsRouterDependencies {
  listAdminSubscriptionsHandler?: typeof listAdminSubscriptions;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

export function createAdminSubscriptionsRouter(
  dependencies: AdminSubscriptionsRouterDependencies = {}
): Router {
  const adminSubscriptionsRouter = Router();
  const listAdminSubscriptionsHandler =
    dependencies.listAdminSubscriptionsHandler ?? listAdminSubscriptions;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminSubscriptionsRouter.get(
    "/",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (_request: Request, response: Response, next) => {
      try {
        const subscriptions = await listAdminSubscriptionsHandler();

        response.json(subscriptions);
      } catch (error) {
        next(error);
      }
    }
  );

  return adminSubscriptionsRouter;
}

const adminSubscriptionsRouter = createAdminSubscriptionsRouter();

export default adminSubscriptionsRouter;
