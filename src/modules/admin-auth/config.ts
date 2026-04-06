import jwt from "jsonwebtoken";

import { AdminAuthConfig } from "./types";
import {
  normalizeCaseInsensitiveValue,
  normalizeCredentialValue,
  normalizePhoneNumber
} from "./utils";

let cachedAdminAuthConfig: AdminAuthConfig | null = null;

function requireEnvValue(env: NodeJS.ProcessEnv, key: string): string {
  const rawValue = env[key];

  if (typeof rawValue !== "string" || normalizeCredentialValue(rawValue) === "") {
    throw new Error(`Missing required admin auth environment variable: ${key}`);
  }

  return normalizeCredentialValue(rawValue);
}

function parseUserTypeId(rawValue: string): number {
  const userTypeId = Number(rawValue);

  if (!Number.isInteger(userTypeId)) {
    throw new Error("ADMIN_SUPER_USER_TYPE_ID must be a valid integer.");
  }

  return userTypeId;
}

function parseCreatedAt(env: NodeJS.ProcessEnv): string | undefined {
  const rawCreatedAt = env.ADMIN_SUPER_CREATED_AT;

  if (typeof rawCreatedAt !== "string" || normalizeCredentialValue(rawCreatedAt) === "") {
    return undefined;
  }

  const createdAt = new Date(rawCreatedAt);

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("ADMIN_SUPER_CREATED_AT must be a valid ISO 8601 datetime.");
  }

  return createdAt.toISOString();
}

function validateJwtSettings(secret: string, expiresIn: string): void {
  try {
    jwt.sign(
      {
        scope: "admin",
        role: "super_admin",
        username: "validation",
        emailAddress: "validation@example.com",
        userTypeId: 4
      },
      secret,
      {
        algorithm: "HS256",
        issuer: "brickpine-admin",
        audience: "admin-api",
        subject: "env:super-admin",
        expiresIn: expiresIn as jwt.SignOptions["expiresIn"]
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JWT validation error.";

    throw new Error(`Invalid admin JWT configuration: ${message}`);
  }
}

export function loadAdminAuthConfig(env: NodeJS.ProcessEnv = process.env): AdminAuthConfig {
  const username = requireEnvValue(env, "ADMIN_SUPER_USERNAME");
  const emailAddress = requireEnvValue(env, "ADMIN_SUPER_EMAIL");
  const phoneNumber = requireEnvValue(env, "ADMIN_SUPER_PHONE");
  const password = requireEnvValue(env, "ADMIN_SUPER_PASSWORD");
  const firstName = requireEnvValue(env, "ADMIN_SUPER_FIRST_NAME");
  const lastName = requireEnvValue(env, "ADMIN_SUPER_LAST_NAME");
  const userTypeId = parseUserTypeId(requireEnvValue(env, "ADMIN_SUPER_USER_TYPE_ID"));
  const createdAt = parseCreatedAt(env);
  const secret = requireEnvValue(env, "ADMIN_JWT_SECRET");
  const expiresIn = requireEnvValue(env, "ADMIN_JWT_EXPIRES_IN");

  validateJwtSettings(secret, expiresIn);

  return {
    superAdmin: {
      username,
      emailAddress,
      phoneNumber,
      password,
      firstName,
      lastName,
      userTypeId,
      createdAt,
      normalizedUsername: normalizeCaseInsensitiveValue(username),
      normalizedEmailAddress: normalizeCaseInsensitiveValue(emailAddress),
      normalizedPhoneNumber: normalizePhoneNumber(phoneNumber)
    },
    jwt: {
      secret,
      expiresIn,
      issuer: "brickpine-admin",
      audience: "admin-api",
      subject: "env:super-admin",
      scope: "admin",
      role: "super_admin"
    }
  };
}

export function getAdminAuthConfig(): AdminAuthConfig {
  if (!cachedAdminAuthConfig) {
    cachedAdminAuthConfig = loadAdminAuthConfig();
  }

  return cachedAdminAuthConfig;
}

export function clearAdminAuthConfigCache(): void {
  cachedAdminAuthConfig = null;
}
