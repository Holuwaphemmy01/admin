import { Request, Response, Router } from "express";

import { AdminAuthenticationError, loginAdmin } from "./service";

const adminAuthRouter = Router();

function isValidCredentialField(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

adminAuthRouter.post("/login", (request: Request, response: Response) => {
  const { username, password } = request.body ?? {};

  if (!isValidCredentialField(username) || !isValidCredentialField(password)) {
    response.status(400).json({
      message: "username and password are required and must be non-empty strings"
    });

    return;
  }

  try {
    const adminSession = loginAdmin({
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

    throw error;
  }
});

export default adminAuthRouter;
