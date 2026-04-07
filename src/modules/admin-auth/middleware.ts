import { NextFunction, Request, Response } from "express";

import { AdminRole, AuthenticatedAdmin } from "./types";
import { verifyAdminToken } from "./service";

declare global {
  namespace Express {
    interface Request {
      admin?: AuthenticatedAdmin;
    }
  }
}

function getBearerToken(request: Request): string | null {
  const authorizationHeader = request.header("authorization");

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export function authenticateAdmin(request: Request, response: Response, next: NextFunction): void {
  const token = getBearerToken(request);

  if (!token) {
    response.status(401).json({
      message: "Unauthorized admin access"
    });

    return;
  }

  try {
    request.admin = verifyAdminToken(token);
    next();
  } catch {
    console.warn("Admin token verification failed.");

    response.status(401).json({
      message: "Unauthorized admin access"
    });
  }
}

export function requireAdminRole(role: AdminRole) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.admin) {
      response.status(401).json({
        message: "Unauthorized admin access"
      });

      return;
    }

    if (request.admin.role !== role) {
      response.status(403).json({
        message: "Forbidden admin action"
      });

      return;
    }

    next();
  };
}
