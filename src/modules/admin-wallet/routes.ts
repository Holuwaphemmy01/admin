import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "../admin-auth/middleware";
import {
  getPlatformWalletOverview,
  getUserWallet,
  ManualCreditWalletConflictError,
  ManualCreditWalletNotFoundError,
  ManualCreditWalletValidationError,
  manualCreditUserWallet,
  PlatformWalletNotFoundError,
  UserWalletConflictError,
  UserWalletNotFoundError,
  UserWalletValidationError
} from "./service";

interface AdminWalletRouterDependencies {
  getPlatformWalletOverviewHandler?: typeof getPlatformWalletOverview;
  getUserWalletHandler?: typeof getUserWallet;
  manualCreditUserWalletHandler?: typeof manualCreditUserWallet;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

export function createAdminWalletRouter(
  dependencies: AdminWalletRouterDependencies = {}
): Router {
  const adminWalletRouter = Router();
  const getPlatformWalletOverviewHandler =
    dependencies.getPlatformWalletOverviewHandler ?? getPlatformWalletOverview;
  const getUserWalletHandler = dependencies.getUserWalletHandler ?? getUserWallet;
  const manualCreditUserWalletHandler =
    dependencies.manualCreditUserWalletHandler ?? manualCreditUserWallet;
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

  adminWalletRouter.post(
    "/manual_credit",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const body = request.body as {
        username?: unknown;
        amount?: unknown;
        description?: unknown;
      };
      const rawUsername = typeof body.username === "string" ? body.username.trim() : "";
      const rawAmount = body.amount;
      const rawDescription =
        typeof body.description === "string" ? body.description.trim() : "";

      if (rawUsername === "") {
        response.status(400).json({
          message: "username is required and must be a non-empty string"
        });

        return;
      }

      if (
        typeof rawAmount !== "number" ||
        !Number.isFinite(rawAmount) ||
        rawAmount <= 0 ||
        Math.abs(rawAmount - Number(rawAmount.toFixed(2))) > Number.EPSILON
      ) {
        response.status(400).json({
          message: "amount is required and must be a positive finite number with at most 2 decimal places"
        });

        return;
      }

      if (rawDescription === "") {
        response.status(400).json({
          message: "description is required and must be a non-empty string"
        });

        return;
      }

      try {
        const result = await manualCreditUserWalletHandler({
          username: rawUsername,
          amount: rawAmount,
          description: rawDescription,
          actedByAdminUserId: request.admin?.sub ?? ""
        });

        response.json(result);
      } catch (error) {
        if (error instanceof ManualCreditWalletValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ManualCreditWalletNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof ManualCreditWalletConflictError) {
          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminWalletRouter.get(
    "/:username",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const rawUsername = request.params.username;
      const username = (Array.isArray(rawUsername) ? rawUsername[0] ?? "" : rawUsername ?? "").trim();

      if (username === "") {
        response.status(400).json({
          message: "username must be a non-empty string"
        });

        return;
      }

      try {
        const userWallet = await getUserWalletHandler(username);

        response.json(userWallet);
      } catch (error) {
        if (error instanceof UserWalletValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof UserWalletNotFoundError) {
          response.status(404).json({
            message: error.message
          });

          return;
        }

        if (error instanceof UserWalletConflictError) {
          response.status(409).json({
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
