import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import {
  PendingKycListFilters,
  PendingKycListResponse,
  PendingKycSubmission,
  PendingKycType,
  PENDING_KYC_STATUS
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminKycServiceDependencies {
  queryFn?: QueryFunction;
}

interface PendingKycSubmissionRow extends QueryResultRow {
  username: string | null;
  kycType: PendingKycType;
  submittedAt: Date;
}

interface TotalCountRow extends QueryResultRow {
  total: number;
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

function mapTextValue(value: string | null): string {
  return typeof value === "string" ? value : "";
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
