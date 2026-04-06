import jwt, { JwtPayload } from "jsonwebtoken";

import { getAdminAuthConfig } from "./config";
import {
  AdminAuthConfig,
  AdminJwtPayload,
  AdminLoginRequestBody,
  AdminLoginResponse,
  AuthenticatedAdmin
} from "./types";
import {
  isPhoneLike,
  normalizeCaseInsensitiveValue,
  normalizeCredentialValue,
  normalizePhoneNumber
} from "./utils";

export class AdminAuthenticationError extends Error {
  constructor(message = "Invalid admin credentials") {
    super(message);
    this.name = "AdminAuthenticationError";
  }
}

function matchesAdminIdentifier(identifier: string, config: AdminAuthConfig): boolean {
  const normalizedIdentifier = normalizeCredentialValue(identifier);
  const normalizedCaseInsensitiveIdentifier = normalizeCaseInsensitiveValue(identifier);

  if (
    normalizedCaseInsensitiveIdentifier === config.superAdmin.normalizedUsername ||
    normalizedCaseInsensitiveIdentifier === config.superAdmin.normalizedEmailAddress
  ) {
    return true;
  }

  if (!isPhoneLike(normalizedIdentifier)) {
    return false;
  }

  return normalizePhoneNumber(normalizedIdentifier) === config.superAdmin.normalizedPhoneNumber;
}

function buildAdminTokenPayload(config: AdminAuthConfig): Omit<AuthenticatedAdmin, "sub"> {
  return {
    scope: config.jwt.scope,
    role: config.jwt.role,
    username: config.superAdmin.username,
    emailAddress: config.superAdmin.emailAddress,
    userTypeId: config.superAdmin.userTypeId
  };
}

export function signAdminToken(config: AdminAuthConfig = getAdminAuthConfig()): string {
  return jwt.sign(buildAdminTokenPayload(config), config.jwt.secret, {
    algorithm: "HS256",
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    subject: config.jwt.subject,
    expiresIn: config.jwt.expiresIn as jwt.SignOptions["expiresIn"]
  });
}

function isValidDecodedAdminPayload(payload: JwtPayload): payload is AdminJwtPayload {
  return (
    payload.sub === "env:super-admin" &&
    payload.scope === "admin" &&
    payload.role === "super_admin" &&
    typeof payload.username === "string" &&
    typeof payload.emailAddress === "string" &&
    typeof payload.userTypeId === "number" &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number" &&
    payload.iss === "brickpine-admin" &&
    payload.aud === "admin-api"
  );
}

export function verifyAdminToken(
  token: string,
  config: AdminAuthConfig = getAdminAuthConfig()
): AdminJwtPayload {
  const decodedPayload = jwt.verify(token, config.jwt.secret, {
    algorithms: ["HS256"],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    subject: config.jwt.subject
  });

  if (typeof decodedPayload === "string" || !isValidDecodedAdminPayload(decodedPayload)) {
    throw new Error("Invalid admin token payload.");
  }

  return decodedPayload;
}

export function loginAdmin(
  credentials: AdminLoginRequestBody,
  config: AdminAuthConfig = getAdminAuthConfig()
): AdminLoginResponse {
  const identifierMatches = matchesAdminIdentifier(credentials.username, config);
  const passwordMatches = credentials.password === config.superAdmin.password;

  if (!identifierMatches || !passwordMatches) {
    throw new AdminAuthenticationError();
  }

  const response: AdminLoginResponse = {
    username: config.superAdmin.username,
    firstName: config.superAdmin.firstName,
    lastName: config.superAdmin.lastName,
    emailAddress: config.superAdmin.emailAddress,
    userTypeId: config.superAdmin.userTypeId,
    token: signAdminToken(config)
  };

  if (config.superAdmin.createdAt) {
    response.createdAt = config.superAdmin.createdAt;
  }

  return response;
}
