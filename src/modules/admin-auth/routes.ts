import { Request, RequestHandler, Response, Router } from "express";

import { authenticateAdmin, requireAdminRole } from "./middleware";
import {
  AdminAuthenticationError,
  AdminInviteConflictError,
  AdminInviteValidationError,
  AdminPasswordChangeError,
  changeAdminPassword,
  createAdminInvite,
  loginAdmin
} from "./service";
import { isAdminRole, isValidEmailAddress } from "./utils";

interface AdminAuthRouterDependencies {
  loginAdminHandler?: typeof loginAdmin;
  createAdminInviteHandler?: typeof createAdminInvite;
  changeAdminPasswordHandler?: typeof changeAdminPassword;
  authenticateAdminMiddleware?: RequestHandler;
  requireSuperAdminMiddleware?: RequestHandler;
}

function isValidCredentialField(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function createAdminAuthRouter(
  dependencies: AdminAuthRouterDependencies = {}
): Router {
  const adminAuthRouter = Router();
  const loginAdminHandler = dependencies.loginAdminHandler ?? loginAdmin;
  const createAdminInviteHandler = dependencies.createAdminInviteHandler ?? createAdminInvite;
  const changeAdminPasswordHandler =
    dependencies.changeAdminPasswordHandler ?? changeAdminPassword;
  const authenticateAdminMiddleware =
    dependencies.authenticateAdminMiddleware ?? authenticateAdmin;
  const requireSuperAdminMiddleware =
    dependencies.requireSuperAdminMiddleware ?? requireAdminRole("super_admin");

  adminAuthRouter.post("/login", async (request: Request, response: Response, next) => {
    const { username, password } = request.body ?? {};

    if (!isValidCredentialField(username) || !isValidCredentialField(password)) {
      response.status(400).json({
        message: "username and password are required and must be non-empty strings"
      });

      return;
    }

    try {
      const adminSession = await loginAdminHandler({
        username,
        password
      });

      console.info(`Admin login successful for "${adminSession.username}".`);

      response.json(adminSession);
    } catch (error) {
      if (error instanceof AdminAuthenticationError) {
        console.warn("Admin login failed due to invalid credentials.");

        response.status(401).json({
          message: error.message
        });

        return;
      }

      next(error);
    }
  });

  adminAuthRouter.post(
    "/invite",
    authenticateAdminMiddleware,
    requireSuperAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const { email, role, firstName, lastName } = request.body ?? {};

      if (
        !isValidCredentialField(email) ||
        !isValidCredentialField(role) ||
        !isValidCredentialField(firstName) ||
        !isValidCredentialField(lastName)
      ) {
        response.status(400).json({
          message: "email, role, firstName, and lastName are required and must be non-empty strings"
        });

        return;
      }

      if (!isValidEmailAddress(email)) {
        response.status(400).json({
          message: "email must be a valid email address"
        });

        return;
      }

      if (!isAdminRole(role)) {
        response.status(400).json({
          message: "role must be one of super_admin, support, finance"
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
        const inviteResponse = await createAdminInviteHandler({
          email,
          role,
          firstName,
          lastName,
          invitedByAdmin: request.admin
        });

        console.info(
          `Admin invite created for "${email.trim().toLowerCase()}" by "${request.admin.username}".`
        );

        response.status(201).json(inviteResponse);
      } catch (error) {
        if (error instanceof AdminInviteValidationError) {
          response.status(400).json({
            message: error.message
          });

          return;
        }

        if (error instanceof AdminInviteConflictError) {
          console.warn(`Admin invite conflict for "${email.trim().toLowerCase()}".`);

          response.status(409).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  adminAuthRouter.put(
    "/change_password",
    authenticateAdminMiddleware,
    async (request: Request, response: Response, next) => {
      const { currentPassword, newPassword } = request.body ?? {};

      if (!isValidCredentialField(currentPassword) || !isValidCredentialField(newPassword)) {
        response.status(400).json({
          message: "currentPassword and newPassword are required and must be non-empty strings"
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
        const passwordChangeResponse = await changeAdminPasswordHandler({
          currentPassword,
          newPassword,
          admin: request.admin
        });

        console.info(`Admin password updated for "${request.admin.username}".`);

        response.json(passwordChangeResponse);
      } catch (error) {
        if (error instanceof AdminPasswordChangeError) {
          console.warn(`Admin password change rejected for "${request.admin.username}".`);

          response.status(400).json({
            message: error.message
          });

          return;
        }

        next(error);
      }
    }
  );

  return adminAuthRouter;
}

const adminAuthRouter = createAdminAuthRouter();

export default adminAuthRouter;
