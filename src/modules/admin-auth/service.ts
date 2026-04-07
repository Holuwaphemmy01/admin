import { createHash, randomBytes, randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import jwt, { JwtPayload } from "jsonwebtoken";
import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import { getAdminAuthConfig } from "./config";
import {
  AdminAuthConfig,
  AdminChangePasswordRequest,
  AdminChangePasswordResponse,
  AdminInviteRequest,
  AdminInviteResponse,
  AdminInviteStatus,
  AdminJwtPayload,
  AdminLoginRequestBody,
  AdminLoginResponse,
  AdminRole,
  AdminStatus,
  AuthenticatedAdmin
} from "./types";
import { ADMIN_PASSWORD_MAX_LENGTH, ADMIN_PASSWORD_MIN_LENGTH } from "./utils.constants";
import {
  formatAdminRole,
  isAdminRole,
  isPhoneLike,
  isValidAdminPassword,
  isValidEmailAddress,
  normalizeCaseInsensitiveValue,
  normalizeCredentialValue,
  normalizeEmailAddress,
  normalizePhoneNumber,
  resolveAdminUsername
} from "./utils";

const ADMIN_PASSWORD_HASH_ROUNDS = 12;

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

export class AdminPasswordChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminPasswordChangeError";
  }
}

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface TransactionClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

type RunInTransaction = <T>(operation: (client: TransactionClient) => Promise<T>) => Promise<T>;

interface AdminAuthServiceDependencies {
  config?: AdminAuthConfig;
  queryFn?: QueryFunction;
  runInTransaction?: RunInTransaction;
  nowFactory?: () => Date;
  uuidFactory?: () => string;
  passwordHasher?: (value: string, rounds: number) => Promise<string>;
  passwordComparer?: (value: string, hash: string) => Promise<boolean>;
  inviteIdFactory?: () => string;
  inviteTokenFactory?: () => string;
  inviteTokenHasher?: (token: string) => string;
}

interface AdminCredentialRow extends QueryResultRow {
  id: string;
  username: string | null;
  emailAddress: string;
  phoneNumber: string | null;
  firstName: string;
  lastName: string;
  role: AdminRole;
  userTypeId: number;
  status: AdminStatus;
  createdAt: Date;
  passwordHash: string;
  passwordVersion: number;
}

interface AdminSessionRow extends QueryResultRow {
  id: string;
  username: string | null;
  emailAddress: string;
  firstName: string;
  lastName: string;
  role: AdminRole;
  userTypeId: number;
  status: AdminStatus;
  createdAt: Date;
  passwordVersion: number;
}

interface ExistingCustomerUserRow extends QueryResultRow {
  id: number;
}

interface ExistingAdminUserRow extends QueryResultRow {
  id: string;
}

interface ExistingInviteRow extends QueryResultRow {
  id: string;
}

interface ExistingSuperAdminRow extends QueryResultRow {
  id: string;
}

interface ExistingAdminCredentialRow extends QueryResultRow {
  adminUserId: string;
}

function getConfig(dependencies: AdminAuthServiceDependencies = {}): AdminAuthConfig {
  return dependencies.config ?? getAdminAuthConfig();
}

function getQueryFn(dependencies: AdminAuthServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getRunInTransaction(dependencies: AdminAuthServiceDependencies = {}): RunInTransaction {
  return dependencies.runInTransaction ?? withTransaction;
}

function getNowFactory(dependencies: AdminAuthServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function getUuidFactory(dependencies: AdminAuthServiceDependencies = {}): () => string {
  return dependencies.uuidFactory ?? randomUUID;
}

function getPasswordHasher(
  dependencies: AdminAuthServiceDependencies = {}
): (value: string, rounds: number) => Promise<string> {
  return dependencies.passwordHasher ?? ((value, rounds) => bcrypt.hash(value, rounds));
}

function getPasswordComparer(
  dependencies: AdminAuthServiceDependencies = {}
): (value: string, hash: string) => Promise<boolean> {
  return dependencies.passwordComparer ?? ((value, hash) => bcrypt.compare(value, hash));
}

function createInviteToken(): string {
  return randomBytes(32).toString("hex");
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function buildAuthenticatedAdmin(admin: AdminSessionRow): AuthenticatedAdmin {
  return {
    sub: admin.id,
    scope: "admin",
    role: admin.role,
    username: resolveAdminUsername(admin.username, admin.emailAddress),
    emailAddress: admin.emailAddress,
    userTypeId: admin.userTypeId,
    passwordVersion: admin.passwordVersion
  };
}

function buildLoginResponse(admin: AdminCredentialRow, token: string): AdminLoginResponse {
  return {
    username: resolveAdminUsername(admin.username, admin.emailAddress),
    firstName: admin.firstName,
    lastName: admin.lastName,
    emailAddress: admin.emailAddress,
    userTypeId: admin.userTypeId,
    token,
    createdAt: admin.createdAt.toISOString()
  };
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
    typeof payload.passwordVersion === "number" &&
    Number.isInteger(payload.passwordVersion) &&
    payload.passwordVersion >= 1 &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number" &&
    payload.iss === "brickpine-admin" &&
    payload.aud === "admin-api"
  );
}

async function findActiveAdminByIdentifier(
  identifier: string,
  queryFn: QueryFunction
): Promise<AdminCredentialRow | null> {
  const normalizedIdentifier = normalizeCredentialValue(identifier);

  if (isPhoneLike(normalizedIdentifier)) {
    const normalizedPhone = normalizePhoneNumber(normalizedIdentifier);

    if (normalizedPhone === "") {
      return null;
    }

    const phoneResult = await queryFn<AdminCredentialRow>(
      [
        "SELECT",
        '  au.id, au.username, au."emailAddress", au."phoneNumber", au."firstName", au."lastName",',
        '  au.role, au."userTypeId", au.status, au."createdAt",',
        '  ac."passwordHash", ac."passwordVersion"',
        "FROM public.admin_users au",
        'JOIN public.admin_credentials ac ON ac."adminUserId" = au.id',
        "WHERE au.status = 'active' AND au.\"phoneNumber\" = $1",
        "LIMIT 1"
      ].join("\n"),
      [normalizedPhone]
    );

    return phoneResult.rows[0] ?? null;
  }

  const normalizedLookup = normalizeCaseInsensitiveValue(identifier);
  const loginResult = await queryFn<AdminCredentialRow>(
    [
      "SELECT",
      '  au.id, au.username, au."emailAddress", au."phoneNumber", au."firstName", au."lastName",',
      '  au.role, au."userTypeId", au.status, au."createdAt",',
      '  ac."passwordHash", ac."passwordVersion"',
      "FROM public.admin_users au",
      'JOIN public.admin_credentials ac ON ac."adminUserId" = au.id',
      [
        "WHERE au.status = 'active' AND (",
        '  LOWER(au.username) = $1 OR LOWER(au."emailAddress") = $1',
        ")"
      ].join("\n"),
      "LIMIT 1"
    ].join("\n"),
    [normalizedLookup]
  );

  return loginResult.rows[0] ?? null;
}

async function findAdminSessionById(
  adminUserId: string,
  queryFn: QueryFunction
): Promise<AdminSessionRow | null> {
  const result = await queryFn<AdminSessionRow>(
    [
      "SELECT",
      '  au.id, au.username, au."emailAddress", au."firstName", au."lastName",',
      '  au.role, au."userTypeId", au.status, au."createdAt",',
      '  ac."passwordVersion"',
      "FROM public.admin_users au",
      'JOIN public.admin_credentials ac ON ac."adminUserId" = au.id',
      "WHERE au.id = $1",
      "LIMIT 1"
    ].join("\n"),
    [adminUserId]
  );

  return result.rows[0] ?? null;
}

async function findAdminCredentialByIdForUpdate(
  adminUserId: string,
  client: TransactionClient
): Promise<AdminCredentialRow | null> {
  const result = await client.query<AdminCredentialRow>(
    [
      "SELECT",
      '  au.id, au.username, au."emailAddress", au."phoneNumber", au."firstName", au."lastName",',
      '  au.role, au."userTypeId", au.status, au."createdAt",',
      '  ac."passwordHash", ac."passwordVersion"',
      "FROM public.admin_users au",
      'JOIN public.admin_credentials ac ON ac."adminUserId" = au.id',
      "WHERE au.id = $1",
      'FOR UPDATE OF ac'
    ].join("\n"),
    [adminUserId]
  );

  return result.rows[0] ?? null;
}

export function signAdminToken(
  admin: AuthenticatedAdmin,
  config: AdminAuthConfig = getAdminAuthConfig()
): string {
  return jwt.sign(
    {
      scope: admin.scope,
      role: admin.role,
      username: admin.username,
      emailAddress: admin.emailAddress,
      userTypeId: admin.userTypeId,
      passwordVersion: admin.passwordVersion
    },
    config.jwt.secret,
    {
      algorithm: "HS256",
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      subject: admin.sub,
      expiresIn: config.jwt.expiresIn as jwt.SignOptions["expiresIn"]
    }
  );
}

export function verifyAdminToken(
  token: string,
  config: AdminAuthConfig = getAdminAuthConfig()
): AdminJwtPayload {
  const decodedPayload = jwt.verify(token, config.jwt.secret, {
    algorithms: ["HS256"],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience
  });

  if (typeof decodedPayload === "string" || !isValidDecodedAdminPayload(decodedPayload)) {
    throw new Error("Invalid admin token payload.");
  }

  return decodedPayload;
}

export async function ensureSuperAdminSeeded(
  dependencies: AdminAuthServiceDependencies = {}
): Promise<void> {
  const config = getConfig(dependencies);
  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const uuidFactory = getUuidFactory(dependencies);
  const passwordHasher = getPasswordHasher(dependencies);

  await runInTransaction(async (client) => {
    const existingAdminResult = await client.query<ExistingSuperAdminRow>(
      'SELECT id FROM public.admin_users WHERE "emailAddress" = $1 LIMIT 1',
      [config.superAdmin.emailAddress]
    );

    let adminUserId = existingAdminResult.rows[0]?.id;

    if (!adminUserId) {
      const timestamp = config.superAdmin.createdAt
        ? new Date(config.superAdmin.createdAt)
        : nowFactory();

      adminUserId = uuidFactory();

      await client.query(
        [
          "INSERT INTO public.admin_users (",
          '  id, username, "emailAddress", "phoneNumber", "firstName", "lastName", role,',
          '  "userTypeId", status, "createdAt", "updatedAt"',
          ") VALUES (",
          "  $1, $2, $3, $4, $5, $6, $7,",
          "  $8, $9, $10, $11",
          ")"
        ].join("\n"),
        [
          adminUserId,
          config.superAdmin.username,
          config.superAdmin.emailAddress,
          config.superAdmin.normalizedPhoneNumber || null,
          config.superAdmin.firstName,
          config.superAdmin.lastName,
          "super_admin",
          config.superAdmin.userTypeId,
          "active",
          timestamp,
          timestamp
        ]
      );
    }

    const existingCredentialResult = await client.query<ExistingAdminCredentialRow>(
      'SELECT "adminUserId" FROM public.admin_credentials WHERE "adminUserId" = $1 LIMIT 1',
      [adminUserId]
    );

    if (!existingCredentialResult.rows[0]) {
      const timestamp = nowFactory();
      const passwordHash = await passwordHasher(
        config.superAdmin.password,
        ADMIN_PASSWORD_HASH_ROUNDS
      );

      await client.query(
        [
          "INSERT INTO public.admin_credentials (",
          '  "adminUserId", "passwordHash", "passwordVersion", "passwordChangedAt", "createdAt", "updatedAt"',
          ") VALUES (",
          "  $1, $2, $3, $4, $5, $6",
          ")"
        ].join("\n"),
        [adminUserId, passwordHash, 1, timestamp, timestamp, timestamp]
      );
    }
  });
}

export async function loginAdmin(
  credentials: AdminLoginRequestBody,
  dependencies: AdminAuthServiceDependencies = {}
): Promise<AdminLoginResponse> {
  const config = getConfig(dependencies);
  const queryFn = getQueryFn(dependencies);
  const passwordComparer = getPasswordComparer(dependencies);

  await ensureSuperAdminSeeded(dependencies);

  const admin = await findActiveAdminByIdentifier(credentials.username, queryFn);

  if (!admin) {
    throw new AdminAuthenticationError();
  }

  const passwordMatches = await passwordComparer(credentials.password, admin.passwordHash);

  if (!passwordMatches) {
    throw new AdminAuthenticationError();
  }

  const authenticatedAdmin = buildAuthenticatedAdmin(admin);

  return buildLoginResponse(admin, signAdminToken(authenticatedAdmin, config));
}

export async function authenticateAdminToken(
  token: string,
  dependencies: AdminAuthServiceDependencies = {}
): Promise<AuthenticatedAdmin> {
  const config = getConfig(dependencies);
  const queryFn = getQueryFn(dependencies);
  const decodedToken = verifyAdminToken(token, config);
  const admin = await findAdminSessionById(decodedToken.sub, queryFn);

  if (!admin || admin.status !== "active") {
    throw new Error("Admin account is not active.");
  }

  if (admin.passwordVersion !== decodedToken.passwordVersion) {
    throw new Error("Admin token password version mismatch.");
  }

  return buildAuthenticatedAdmin(admin);
}

export async function changeAdminPassword(
  input: AdminChangePasswordRequest,
  dependencies: AdminAuthServiceDependencies = {}
): Promise<AdminChangePasswordResponse> {
  if (input.newPassword === input.currentPassword) {
    throw new AdminPasswordChangeError("newPassword must be different from currentPassword");
  }

  if (!isValidAdminPassword(input.newPassword)) {
    throw new AdminPasswordChangeError(
      `newPassword must be between ${ADMIN_PASSWORD_MIN_LENGTH} and ${ADMIN_PASSWORD_MAX_LENGTH} characters`
    );
  }

  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const passwordHasher = getPasswordHasher(dependencies);
  const passwordComparer = getPasswordComparer(dependencies);

  await runInTransaction(async (client) => {
    const admin = await findAdminCredentialByIdForUpdate(input.admin.sub, client);

    if (!admin || admin.status !== "active") {
      throw new AdminPasswordChangeError("Admin account is not active");
    }

    const currentPasswordMatches = await passwordComparer(
      input.currentPassword,
      admin.passwordHash
    );

    if (!currentPasswordMatches) {
      throw new AdminPasswordChangeError("currentPassword is incorrect");
    }

    const timestamp = nowFactory();
    const passwordHash = await passwordHasher(input.newPassword, ADMIN_PASSWORD_HASH_ROUNDS);

    await client.query(
      [
        "UPDATE public.admin_credentials",
        'SET "passwordHash" = $1,',
        '    "passwordVersion" = "passwordVersion" + 1,',
        '    "passwordChangedAt" = $2,',
        '    "updatedAt" = $2',
        'WHERE "adminUserId" = $3'
      ].join("\n"),
      [passwordHash, timestamp, input.admin.sub]
    );
  });

  return {
    message: "Password updated successfully"
  };
}

export async function createAdminInvite(
  invite: AdminInviteRequest,
  dependencies: AdminAuthServiceDependencies = {}
): Promise<AdminInviteResponse> {
  const config = getConfig(dependencies);
  const runInTransaction = getRunInTransaction(dependencies);
  const inviteIdFactory = dependencies.inviteIdFactory ?? randomUUID;
  const inviteTokenFactory = dependencies.inviteTokenFactory ?? createInviteToken;
  const inviteTokenHasher = dependencies.inviteTokenHasher ?? hashInviteToken;
  const nowFactory = getNowFactory(dependencies);

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
      const existingCustomerUser = await client.query<ExistingCustomerUserRow>(
        'SELECT id FROM public."user" WHERE LOWER("emailAddress") = $1 LIMIT 1',
        [normalizedEmail]
      );

      if (existingCustomerUser.rowCount && existingCustomerUser.rowCount > 0) {
        throw new AdminInviteConflictError("This email address already belongs to an existing user");
      }

      const existingAdminUser = await client.query<ExistingAdminUserRow>(
        'SELECT id FROM public.admin_users WHERE "emailAddress" = $1 LIMIT 1',
        [normalizedEmail]
      );

      if (existingAdminUser.rowCount && existingAdminUser.rowCount > 0) {
        throw new AdminInviteConflictError("This email address already belongs to an existing admin");
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
