import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import {
  APPROVED_KYC_STATUS,
  ApproveUserKycResponse,
  KycFormFieldValue,
  KycFormStep,
  PendingKycListFilters,
  PendingKycListResponse,
  PendingKycSubmission,
  PendingKycStatus,
  PendingKycType,
  PENDING_KYC_STATUS,
  REJECTED_KYC_STATUS,
  UserKycSubmissionResponse
} from "./types";

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

interface AdminKycServiceDependencies {
  queryFn?: QueryFunction;
  runInTransaction?: RunInTransaction;
  nowFactory?: () => Date;
}

interface PendingKycSubmissionRow extends QueryResultRow {
  username: string | null;
  kycType: PendingKycType;
  submittedAt: Date;
}

interface TotalCountRow extends QueryResultRow {
  total: number;
}

interface UserKycMatchRow extends QueryResultRow {
  id: number;
  username: string | null;
  userTypeId: 2 | 3;
  kycStatus: number | null;
}

interface UserKycFormRow extends QueryResultRow {
  id: number;
  completedStep: number | null;
  createdAt: Date;
  updatedAt: Date;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  phoneNumber: string | null;
  residentialAddress: string | null;
  validId: string | null;
  validIdFileType: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  bankStatement: string | null;
  bankStatementFileType: string | null;
  confirmAccuracy: boolean | null;
  privacyConsent: boolean | null;
  termsConsent: boolean | null;
  businessName: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  businessAddress: string | null;
  authorizedRepresentativeName: string | null;
  authorizedRepresentativePhone: string | null;
  authorizedRepresentativeEmail: string | null;
  tinNumber: string | null;
  cacCertificate: string | null;
  cacCertificateFileType: string | null;
  tinNumberCertificate: string | null;
  tinNumberCertificateFileType: string | null;
  age: number | null;
  profilePhoto: string | null;
  profilePhotoFileType: string | null;
  proofOfDrivingExperience: string | null;
  proofOfDrivingExperienceFileType: string | null;
  vehicleRegistrationDocument: string | null;
  vehicleRegistrationDocumentFileType: string | null;
  insuranceCertificate: string | null;
  insuranceCertificateFileType: string | null;
  roadWorthinessCertificate: string | null;
  roadWorthinessCertificateFileType: string | null;
  hackneyPermit: string | null;
  hackneyPermitFileType: string | null;
  vehicleType: string | null;
}

const COMPANY_MARKERS_SQL = [
  `NULLIF(BTRIM(COALESCE(latest_kyc."businessName", '')), '') IS NOT NULL`,
  `NULLIF(BTRIM(COALESCE(latest_kyc."businessEmail", '')), '') IS NOT NULL`,
  `NULLIF(BTRIM(COALESCE(latest_kyc."businessPhone", '')), '') IS NOT NULL`,
  `NULLIF(BTRIM(COALESCE(latest_kyc."businessAddress", '')), '') IS NOT NULL`,
  `NULLIF(BTRIM(COALESCE(latest_kyc."authorizedRepresentativeName", '')), '') IS NOT NULL`,
  `NULLIF(BTRIM(COALESCE(latest_kyc."authorizedRepresentativePhone", '')), '') IS NOT NULL`,
  `NULLIF(BTRIM(COALESCE(latest_kyc."authorizedRepresentativeEmail", '')), '') IS NOT NULL`,
  `NULLIF(BTRIM(COALESCE(latest_kyc."tinNumber", '')), '') IS NOT NULL`,
  `NULLIF(BTRIM(COALESCE(latest_kyc."cacCertificate", '')), '') IS NOT NULL`,
  `NULLIF(BTRIM(COALESCE(latest_kyc."tinNumberCertificate", '')), '') IS NOT NULL`
].join("\n      OR ");

function getQueryFn(dependencies: AdminKycServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getRunInTransaction(
  dependencies: AdminKycServiceDependencies = {}
): RunInTransaction {
  return dependencies.runInTransaction ?? withTransaction;
}

function getNowFactory(dependencies: AdminKycServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function mapTextValue(value: string | null): string {
  return typeof value === "string" ? value : "";
}

function mapNullableTextValue(value: string | null): string | null {
  return typeof value === "string" ? value : null;
}

type MessageErrorConstructor = new (message: string) => Error;

function normalizeKycUsername(username: string, ErrorType: MessageErrorConstructor): string {
  const normalizedUsername = username.trim();

  if (normalizedUsername === "") {
    throw new ErrorType("username must be a non-empty string");
  }

  return normalizedUsername;
}

function hasNonBlankText(value: string | null): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function hasCompanyMarkers(form: UserKycFormRow): boolean {
  return [
    form.businessName,
    form.businessEmail,
    form.businessPhone,
    form.businessAddress,
    form.authorizedRepresentativeName,
    form.authorizedRepresentativePhone,
    form.authorizedRepresentativeEmail,
    form.tinNumber,
    form.cacCertificate,
    form.tinNumberCertificate
  ].some(hasNonBlankText);
}

function deriveKycType(userTypeId: 2 | 3, latestForm: UserKycFormRow): PendingKycType {
  const isRegistered = hasCompanyMarkers(latestForm);

  if (userTypeId === 2) {
    return isRegistered ? "registered_company" : "individual_seller";
  }

  return isRegistered ? "registered_logistic" : "individual_logistic";
}

function mapKycStatus(statusCode: number | null): PendingKycStatus {
  if (statusCode === 1) {
    return APPROVED_KYC_STATUS;
  }

  if (statusCode === 3) {
    return REJECTED_KYC_STATUS;
  }

  return PENDING_KYC_STATUS;
}

function hasMeaningfulFieldValue(value: KycFormFieldValue): boolean {
  if (typeof value === "string") {
    return value.trim() !== "";
  }

  return value !== null;
}

function buildKycFormStep(
  step: number,
  section: string,
  fields: Record<string, KycFormFieldValue>
): KycFormStep | null {
  const hasAnyField = Object.values(fields).some(hasMeaningfulFieldValue);

  if (!hasAnyField) {
    return null;
  }

  return {
    step,
    section,
    fields
  };
}

function mapLatestKycForms(latestForm: UserKycFormRow, kycType: PendingKycType): KycFormStep[] {
  const identityStep = buildKycFormStep(1, "identity", {
    firstName: mapNullableTextValue(latestForm.firstName),
    lastName: mapNullableTextValue(latestForm.lastName),
    emailAddress: mapNullableTextValue(latestForm.emailAddress),
    phoneNumber: mapNullableTextValue(latestForm.phoneNumber),
    residentialAddress: mapNullableTextValue(latestForm.residentialAddress),
    validId: mapNullableTextValue(latestForm.validId),
    validIdFileType: mapNullableTextValue(latestForm.validIdFileType)
  });

  const bankingStep = buildKycFormStep(2, "banking", {
    bankName: mapNullableTextValue(latestForm.bankName),
    accountName: mapNullableTextValue(latestForm.accountName),
    accountNumber: mapNullableTextValue(latestForm.accountNumber),
    bankStatement: mapNullableTextValue(latestForm.bankStatement),
    bankStatementFileType: mapNullableTextValue(latestForm.bankStatementFileType),
    confirmAccuracy: latestForm.confirmAccuracy,
    privacyConsent: latestForm.privacyConsent,
    termsConsent: latestForm.termsConsent
  });

  let verificationStep: KycFormStep | null;

  if (kycType === "registered_company" || kycType === "registered_logistic") {
    verificationStep = buildKycFormStep(3, "business_verification", {
      businessName: mapNullableTextValue(latestForm.businessName),
      businessEmail: mapNullableTextValue(latestForm.businessEmail),
      businessPhone: mapNullableTextValue(latestForm.businessPhone),
      businessAddress: mapNullableTextValue(latestForm.businessAddress),
      authorizedRepresentativeName: mapNullableTextValue(latestForm.authorizedRepresentativeName),
      authorizedRepresentativePhone: mapNullableTextValue(
        latestForm.authorizedRepresentativePhone
      ),
      authorizedRepresentativeEmail: mapNullableTextValue(
        latestForm.authorizedRepresentativeEmail
      ),
      tinNumber: mapNullableTextValue(latestForm.tinNumber),
      cacCertificate: mapNullableTextValue(latestForm.cacCertificate),
      cacCertificateFileType: mapNullableTextValue(latestForm.cacCertificateFileType),
      tinNumberCertificate: mapNullableTextValue(latestForm.tinNumberCertificate),
      tinNumberCertificateFileType: mapNullableTextValue(
        latestForm.tinNumberCertificateFileType
      )
    });
  } else if (kycType === "individual_logistic") {
    verificationStep = buildKycFormStep(3, "logistics_verification", {
      age: latestForm.age,
      profilePhoto: mapNullableTextValue(latestForm.profilePhoto),
      profilePhotoFileType: mapNullableTextValue(latestForm.profilePhotoFileType),
      proofOfDrivingExperience: mapNullableTextValue(latestForm.proofOfDrivingExperience),
      proofOfDrivingExperienceFileType: mapNullableTextValue(
        latestForm.proofOfDrivingExperienceFileType
      ),
      vehicleRegistrationDocument: mapNullableTextValue(
        latestForm.vehicleRegistrationDocument
      ),
      vehicleRegistrationDocumentFileType: mapNullableTextValue(
        latestForm.vehicleRegistrationDocumentFileType
      ),
      insuranceCertificate: mapNullableTextValue(latestForm.insuranceCertificate),
      insuranceCertificateFileType: mapNullableTextValue(
        latestForm.insuranceCertificateFileType
      ),
      roadWorthinessCertificate: mapNullableTextValue(latestForm.roadWorthinessCertificate),
      roadWorthinessCertificateFileType: mapNullableTextValue(
        latestForm.roadWorthinessCertificateFileType
      ),
      hackneyPermit: mapNullableTextValue(latestForm.hackneyPermit),
      hackneyPermitFileType: mapNullableTextValue(latestForm.hackneyPermitFileType),
      vehicleType: mapNullableTextValue(latestForm.vehicleType)
    });
  } else {
    verificationStep = null;
  }

  return [identityStep, bankingStep, verificationStep].filter(
    (step): step is KycFormStep => step !== null
  );
}

export class UserKycSubmissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserKycSubmissionValidationError";
  }
}

export class UserKycSubmissionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserKycSubmissionNotFoundError";
  }
}

export class UserKycSubmissionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserKycSubmissionConflictError";
  }
}

export class ApproveUserKycValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApproveUserKycValidationError";
  }
}

export class ApproveUserKycNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApproveUserKycNotFoundError";
  }
}

export class ApproveUserKycConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApproveUserKycConflictError";
  }
}

function mapPendingKycSubmission(
  submission: PendingKycSubmissionRow
): PendingKycSubmission {
  return {
    username: mapTextValue(submission.username),
    kycType: submission.kycType,
    status: PENDING_KYC_STATUS,
    submittedAt: submission.submittedAt.toISOString()
  };
}

function buildPendingKycBaseQuery(): string {
  return [
    "WITH latest_kyc AS (",
    "  SELECT",
    '    k.id, k."userId", k."createdAt",',
    '    k."businessName", k."businessEmail", k."businessPhone", k."businessAddress",',
    '    k."authorizedRepresentativeName", k."authorizedRepresentativePhone",',
    '    k."authorizedRepresentativeEmail", k."tinNumber", k."cacCertificate",',
    '    k."tinNumberCertificate",',
    '    ROW_NUMBER() OVER (PARTITION BY k."userId" ORDER BY k."createdAt" DESC, k.id DESC) AS row_number',
    "  FROM public.kyc k",
    "), pending_submissions AS (",
    "  SELECT",
    "    u.username,",
    "    CASE",
    `      WHEN u."userTypeId" = 2 AND (${COMPANY_MARKERS_SQL}) THEN 'registered_company'`,
    `      WHEN u."userTypeId" = 2 THEN 'individual_seller'`,
    `      WHEN u."userTypeId" = 3 AND (${COMPANY_MARKERS_SQL}) THEN 'registered_logistic'`,
    `      ELSE 'individual_logistic'`,
    '    END AS "kycType",',
    '    latest_kyc."createdAt" AS "submittedAt"',
    "  FROM latest_kyc",
    '  JOIN public."user" u ON u.id = latest_kyc."userId"',
    "  WHERE latest_kyc.row_number = 1",
    '    AND u."kycStatus" = 0',
    '    AND u."userTypeId" IN (2, 3)',
    ")"
  ].join("\n");
}

function buildPendingKycFilters(
  filters: PendingKycListFilters
): { whereSql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.type) {
    params.push(filters.type);
    clauses.push(`ps."kycType" = $${params.length}`);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

export async function listPendingKycSubmissions(
  filters: PendingKycListFilters,
  dependencies: AdminKycServiceDependencies = {}
): Promise<PendingKycListResponse> {
  const queryFn = getQueryFn(dependencies);
  const baseQuery = buildPendingKycBaseQuery();
  const { whereSql, params } = buildPendingKycFilters(filters);
  const paginationParams = [...params, filters.limit, (filters.page - 1) * filters.limit];

  const submissionsResult = await queryFn<PendingKycSubmissionRow>(
    [
      baseQuery,
      "SELECT",
      '  ps.username, ps."kycType", ps."submittedAt"',
      "FROM pending_submissions ps",
      whereSql,
      'ORDER BY ps."submittedAt" DESC',
      `LIMIT $${params.length + 1}`,
      `OFFSET $${params.length + 2}`
    ]
      .filter((segment) => segment !== "")
      .join("\n"),
    paginationParams
  );

  const totalResult = await queryFn<TotalCountRow>(
    [
      baseQuery,
      "SELECT",
      "  COUNT(*)::int AS total",
      "FROM pending_submissions ps",
      whereSql
    ]
      .filter((segment) => segment !== "")
      .join("\n"),
    params
  );

  return {
    submissions: submissionsResult.rows.map(mapPendingKycSubmission),
    total: Number(totalResult.rows[0]?.total ?? 0)
  };
}

export async function getUserKycSubmission(
  username: string,
  dependencies: AdminKycServiceDependencies = {}
): Promise<UserKycSubmissionResponse> {
  const normalizedUsername = normalizeKycUsername(username, UserKycSubmissionValidationError);
  const queryFn = getQueryFn(dependencies);

  const matchedUserResult = await queryFn<UserKycMatchRow>(
    [
      "SELECT",
      '  u.id, u.username, u."userTypeId", u."kycStatus"',
      'FROM public."user" u',
      'WHERE u."userTypeId" IN (2, 3) AND LOWER(u.username) = LOWER($1)',
      'ORDER BY u."createdAt" DESC',
      "LIMIT 2"
    ].join("\n"),
    [normalizedUsername]
  );

  if ((matchedUserResult.rowCount ?? 0) === 0) {
    throw new UserKycSubmissionNotFoundError("KYC submission not found");
  }

  if ((matchedUserResult.rowCount ?? 0) > 1) {
    throw new UserKycSubmissionConflictError("Multiple users match the provided username");
  }

  const matchedUser = matchedUserResult.rows[0];

  const formsResult = await queryFn<UserKycFormRow>(
    [
      "SELECT",
      '  k.id, k."completedStep", k."createdAt", k."updatedAt",',
      '  k."firstName", k."lastName", k."emailAddress", k."phoneNumber",',
      '  k."residentialAddress", k."validId", k."validIdFileType",',
      '  k."bankName", k."accountName", k."accountNumber",',
      '  k."bankStatement", k."bankStatementFileType",',
      '  k."confirmAccuracy", k."privacyConsent", k."termsConsent",',
      '  k."businessName", k."businessEmail", k."businessPhone", k."businessAddress",',
      '  k."authorizedRepresentativeName", k."authorizedRepresentativePhone",',
      '  k."authorizedRepresentativeEmail", k."tinNumber",',
      '  k."cacCertificate", k."cacCertificateFileType",',
      '  k."tinNumberCertificate", k."tinNumberCertificateFileType",',
      '  k.age, k."profilePhoto", k."profilePhotoFileType",',
      '  k."proofOfDrivingExperience", k."proofOfDrivingExperienceFileType",',
      '  k."vehicleRegistrationDocument", k."vehicleRegistrationDocumentFileType",',
      '  k."insuranceCertificate", k."insuranceCertificateFileType",',
      '  k."roadWorthinessCertificate", k."roadWorthinessCertificateFileType",',
      '  k."hackneyPermit", k."hackneyPermitFileType", k."vehicleType"',
      "FROM public.kyc k",
      'WHERE k."userId" = $1',
      'ORDER BY k."createdAt" DESC, k.id DESC'
    ].join("\n"),
    [matchedUser.id]
  );

  if ((formsResult.rowCount ?? 0) === 0) {
    throw new UserKycSubmissionNotFoundError("KYC submission not found");
  }

  const latestForm = formsResult.rows[0];
  const kycType = deriveKycType(matchedUser.userTypeId, latestForm);
  const forms = mapLatestKycForms(latestForm, kycType);

  return {
    username: mapTextValue(matchedUser.username),
    kycType,
    status: mapKycStatus(matchedUser.kycStatus),
    forms,
    submittedAt: latestForm.createdAt.toISOString()
  };
}

interface ApproveUserKycInput {
  username: string;
}

export async function approveUserKyc(
  input: ApproveUserKycInput,
  dependencies: AdminKycServiceDependencies = {}
): Promise<ApproveUserKycResponse> {
  const normalizedUsername = normalizeKycUsername(
    input.username,
    ApproveUserKycValidationError
  );
  const runInTransaction = getRunInTransaction(dependencies);
  const nowFactory = getNowFactory(dependencies);

  return runInTransaction(async (client) => {
    const matchedUserResult = await client.query<UserKycMatchRow>(
      [
        "SELECT",
        '  u.id, u.username, u."userTypeId", u."kycStatus"',
        'FROM public."user" u',
        'WHERE u."userTypeId" IN (2, 3) AND LOWER(u.username) = LOWER($1)',
        'ORDER BY u."createdAt" DESC',
        "LIMIT 2",
        "FOR UPDATE"
      ].join("\n"),
      [normalizedUsername]
    );

    if ((matchedUserResult.rowCount ?? 0) === 0) {
      throw new ApproveUserKycNotFoundError("KYC submission not found");
    }

    if ((matchedUserResult.rowCount ?? 0) > 1) {
      throw new ApproveUserKycConflictError("Multiple users match the provided username");
    }

    const matchedUser = matchedUserResult.rows[0];
    const formsResult = await client.query<UserKycFormRow>(
      [
        "SELECT",
        "  k.id",
        "FROM public.kyc k",
        'WHERE k."userId" = $1',
        'ORDER BY k."createdAt" DESC, k.id DESC',
        "LIMIT 1"
      ].join("\n"),
      [matchedUser.id]
    );

    if ((formsResult.rowCount ?? 0) === 0) {
      throw new ApproveUserKycNotFoundError("KYC submission not found");
    }

    if (matchedUser.kycStatus === 1) {
      throw new ApproveUserKycConflictError("KYC is already approved");
    }

    await client.query(
      [
        'UPDATE public."user"',
        'SET "kycStatus" = $1,',
        '    "updatedAt" = $2',
        "WHERE id = $3"
      ].join("\n"),
      [1, nowFactory(), matchedUser.id]
    );

    return {
      message: "KYC status updated to approved",
      username: mapTextValue(matchedUser.username)
    };
  });
}
