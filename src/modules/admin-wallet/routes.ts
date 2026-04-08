import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import { getPlatformWalletOverview, PlatformWalletNotFoundError } from "./service";

interface AdminWalletRouterDependencies {
  getPlatformWalletOverviewHandler?: typeof getPlatformWalletOverview;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

export function createAdminWalletRouter(
  dependencies: AdminWalletRouterDependencies = {}
): Router {
  const adminWalletRouter = Router();
  const getPlatformWalletOverviewHandler =
    dependencies.getPlatformWalletOverviewHandler ?? getPlatformWalletOverview;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminWalletRouter.get(
    "/platform",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (_request: Request, response: Response, next) => {
      try {
        const walletOverview = await getPlatformWalletOverviewHandler();

        response.json(walletOverview);
      } catch (error) {
        if (error instanceof PlatformWalletNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminWalletRouter;
}

const adminWalletRouter = createAdminWalletRouter();

export default adminWalletRouter;
