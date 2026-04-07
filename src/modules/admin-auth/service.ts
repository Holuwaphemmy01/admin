import { createHash, randomBytes, randomUUID } from "node:crypto";

import jwt, { JwtPayload } from "jsonwebtoken";
import { QueryResult, QueryResultRow } from "pg";

import { withTransaction } from "../../config/db";
import { getAdminAuthConfig } from "./config";
import {
  AdminInviteRequest,
  AdminInviteResponse,
  AdminInviteStatus,
  AdminRole,
  AdminAuthConfig,
  AdminJwtPayload,
  AdminLoginRequestBody,
  AdminLoginResponse,
  AuthenticatedAdmin
} from "./types";
import {
  formatAdminRole,
  isAdminRole,
  isValidEmailAddress,
  isPhoneLike,
  normalizeCaseInsensitiveValue,
  normalizeCredentialValue,
  normalizeEmailAddress,
  normalizePhoneNumber
} from "./utils";

export class AdminAuthenticationError extends Error {
  constructor(message = "Invalid admin credentials") {
    super(message);
    this.name = "AdminAuthenticationError";
  }
}

export class AdminInviteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminInviteValidationError";
  }
}

export class AdminInviteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminInviteConflictError";
  }
}

interface TransactionClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

interface CreateAdminInviteDependencies {
  config?: AdminAuthConfig;
  runInTransaction?: <T>(operation: (client: TransactionClient) => Promise<T>) => Promise<T>;
  inviteIdFactory?: () => string;
  inviteTokenFactory?: () => string;
  inviteTokenHasher?: (token: string) => string;
  nowFactory?: () => Date;
}

interface ExistingUserRow {
  id: number;
}

interface ExistingInviteRow {
  id: string;
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
    typeof payload.sub === "string" &&
    payload.sub.length > 0 &&
    payload.scope === "admin" &&
    typeof payload.role === "string" &&
    isAdminRole(payload.role) &&
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

function buildInviteLink(frontendUrl: string, inviteId: string, token: string): string {
  const inviteUrl = new URL(frontendUrl);

  inviteUrl.searchParams.set("inviteId", inviteId);
  inviteUrl.searchParams.set("token", token);

  return inviteUrl.toString();
}

function buildInviteEmailContent(input: {
  inviteeFirstName: string;
  inviteeLastName: string;
  role: AdminRole;
  inviteLink: string;
  expiresAt: Date;
}): { subject: string; message: string } {
  const roleLabel = formatAdminRole(input.role);

  return {
    subject: `BrickPine Admin Invite - ${roleLabel}`,
    message: [
      `Hello ${input.inviteeFirstName} ${input.inviteeLastName},`,
      "",
      `You have been invited to join BrickPine Admin as a ${roleLabel}.`,
      "",
      "Use the link below to accept your invite:",
      input.inviteLink,
      "",
      `This invite expires on ${input.expiresAt.toISOString()}.`,
      "",
      "If you were not expecting this invite, please ignore this email."
    ].join("\n")
  };
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createInviteToken(): string {
  return randomBytes(32).toString("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function createAdminInvite(
  invite: AdminInviteRequest,
  dependencies: CreateAdminInviteDependencies = {}
): Promise<AdminInviteResponse> {
  const config = dependencies.config ?? getAdminAuthConfig();
  const runInTransaction = dependencies.runInTransaction ?? withTransaction;
  const inviteIdFactory = dependencies.inviteIdFactory ?? randomUUID;
  const inviteTokenFactory = dependencies.inviteTokenFactory ?? createInviteToken;
  const inviteTokenHasher = dependencies.inviteTokenHasher ?? hashInviteToken;
  const nowFactory = dependencies.nowFactory ?? (() => new Date());

  const normalizedEmail = normalizeEmailAddress(invite.email);
  const normalizedFirstName = normalizeCredentialValue(invite.firstName);
  const normalizedLastName = normalizeCredentialValue(invite.lastName);

  if (!isValidEmailAddress(normalizedEmail)) {
    throw new AdminInviteValidationError("email must be a valid email address");
  }

  if (!isAdminRole(invite.role)) {
    throw new AdminInviteValidationError("role must be one of super_admin, support, finance");
  }

  const inviteId = inviteIdFactory();
  const rawInviteToken = inviteTokenFactory();
  const inviteTokenHash = inviteTokenHasher(rawInviteToken);
  const createdAt = nowFactory();
  const expiresAt = new Date(createdAt);

  expiresAt.setDate(expiresAt.getDate() + config.invite.expiryDays);

  const inviteLink = buildInviteLink(config.invite.frontendUrl, inviteId, rawInviteToken);
  const emailContent = buildInviteEmailContent({
    inviteeFirstName: normalizedFirstName,
    inviteeLastName: normalizedLastName,
    role: invite.role,
    inviteLink,
    expiresAt
  });
  const pendingStatus: AdminInviteStatus = "pending";

  try {
    await runInTransaction(async (client) => {
      const existingUser = await client.query<ExistingUserRow>(
        'SELECT id FROM public."user" WHERE LOWER("emailAddress") = $1 LIMIT 1',
        [normalizedEmail]
      );

      if (existingUser.rowCount && existingUser.rowCount > 0) {
        throw new AdminInviteConflictError("This email address already belongs to an existing user");
      }

      const existingInvite = await client.query<ExistingInviteRow>(
        "SELECT id FROM public.admin_invites WHERE email = $1 AND status = 'pending' LIMIT 1",
        [normalizedEmail]
      );

      if (existingInvite.rowCount && existingInvite.rowCount > 0) {
        throw new AdminInviteConflictError(
          "An admin invite is already pending for this email address"
        );
      }

      await client.query(
        [
          "INSERT INTO public.admin_invites (",
          '  id, email, role, "firstName", "lastName", status,',
          '  "inviteTokenHash", "expiresAt", "invitedByAdminUsername", "invitedByAdminEmail",',
          '  "createdAt", "updatedAt"',
          ") VALUES (",
          "  $1, $2, $3, $4, $5, $6,",
          "  $7, $8, $9, $10,",
          "  $11, $12",
          ")"
        ].join("\n"),
        [
          inviteId,
          normalizedEmail,
          invite.role,
          normalizedFirstName,
          normalizedLastName,
          pendingStatus,
          inviteTokenHash,
          expiresAt,
          invite.invitedByAdmin.username,
          invite.invitedByAdmin.emailAddress,
          createdAt,
          createdAt
        ]
      );

      await client.query(
        [
          "INSERT INTO public.email (",
          '  "from", "emailAddress", subject, message, type, status, "createdAt", "updatedAt"',
          ") VALUES (",
          "  $1, $2, $3, $4, $5, $6, $7, $8",
          ")"
        ].join("\n"),
        [
          config.superAdmin.emailAddress,
          normalizedEmail,
          emailContent.subject,
          emailContent.message,
          "admin-invite",
          "1",
          createdAt,
          createdAt
        ]
      );
    });
  } catch (error) {
    if (error instanceof AdminInviteConflictError || error instanceof AdminInviteValidationError) {
      throw error;
    }

    if (isUniqueViolation(error)) {
      throw new AdminInviteConflictError("An admin invite is already pending for this email address");
    }

    throw error;
  }

  return {
    message: "Invite sent successfully",
    inviteId
  };
}
