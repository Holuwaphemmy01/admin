import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import {
  AdminCampaignStatusFilter,
  AdminCampaignsListFilters,
  AdminCampaignsListResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminCampaignsServiceDependencies {
  queryFn?: QueryFunction;
}

interface AdminCampaignRow extends QueryResultRow {
  id: string | number;
  username: string | null;
  goal: string | null;
  status: string | null;
  budget: string | number | null;
  startDate: Date | null;
  endDate: Date | null;
}

interface TotalCountRow extends QueryResultRow {
  total: number;
}

export class AdminCampaignsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminCampaignsValidationError";
  }
}

function getQueryFn(dependencies: AdminCampaignsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AdminCampaignsValidationError(`${fieldName} must be a positive integer`);
  }

  return value;
}

function normalizeOptionalUsername(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new AdminCampaignsValidationError("username must be a non-empty string when provided");
  }

  return normalizedValue;
}

function normalizeOptionalStatus(
  value: string | undefined
): AdminCampaignStatusFilter | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value !== "draft" &&
    value !== "pending_approval" &&
    value !== "active" &&
    value !== "paused" &&
    value !== "completed" &&
    value !== "rejected"
  ) {
    throw new AdminCampaignsValidationError(
      "status must be one of draft, pending_approval, active, paused, completed, rejected"
    );
  }

  return value;
}

function mapRequiredIdAsString(value: string | number | null, fieldName: string): string {
  if (value === null || value === undefined) {
    throw new Error(`Admin campaigns query returned an invalid ${fieldName} value`);
  }

  const normalizedValue = String(value).trim();

  if (normalizedValue === "") {
    throw new Error(`Admin campaigns query returned an invalid ${fieldName} value`);
  }

  return normalizedValue;
}

function mapRequiredText(value: string | null | undefined, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`Admin campaigns query returned an invalid ${fieldName} value`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new Error(`Admin campaigns query returned an invalid ${fieldName} value`);
  }

  return normalizedValue;
}

function mapRequiredNumber(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Admin campaigns query returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapOptionalDate(value: Date | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Admin campaigns query returned an invalid date value");
  }

  return value.toISOString();
}

function mapCampaignGoal(value: string | null | undefined): string {
  const normalizedValue =
    typeof value === "string" && value.trim() !== "" ? value.trim().toLowerCase() : null;

  if (normalizedValue === "visit_profile") {
    return "awareness";
  }

  if (normalizedValue === "get_messages") {
    return "engagement";
  }

  if (normalizedValue === "increase_website_visits") {
    return "conversion";
  }

  if (normalizedValue === null) {
    return "unknown";
  }

  return normalizedValue;
}

function mapCampaignStatus(value: string | null | undefined): string {
  const normalizedValue =
    typeof value === "string" && value.trim() !== "" ? value.trim().toLowerCase() : null;

  if (normalizedValue === "cancelled") {
    return "paused";
  }

  if (normalizedValue === null) {
    return "unknown";
  }

  return normalizedValue;
}

function mapStatusFilterToStoredStatuses(status: AdminCampaignStatusFilter): string[] {
  if (status === "paused") {
    return ["paused", "cancelled"];
  }

  return [status];
}

function buildCampaignFilters(filters: AdminCampaignsListFilters): {
  whereSql: string;
  params: unknown[];
} {
  const clauses = ["1 = 1"];
  const params: unknown[] = [];

  if (typeof filters.status === "string") {
    params.push(mapStatusFilterToStoredStatuses(filters.status));
    clauses.push(`LOWER(COALESCE(ppc.status::text, '')) = ANY($${params.length}::text[])`);
  }

  if (typeof filters.username === "string") {
    params.push(filters.username);
    clauses.push(`LOWER(BTRIM(u.username)) = LOWER($${params.length})`);
  }

  return {
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params
  };
}

export async function listAdminCampaigns(
  filters: AdminCampaignsListFilters,
  dependencies: AdminCampaignsServiceDependencies = {}
): Promise<AdminCampaignsListResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedFilters: AdminCampaignsListFilters = {
    page: normalizePositiveInteger(filters.page, "page"),
    limit: normalizePositiveInteger(filters.limit, "limit"),
    ...(filters.status !== undefined
      ? { status: normalizeOptionalStatus(filters.status) }
      : {}),
    ...(filters.username !== undefined
      ? { username: normalizeOptionalUsername(filters.username) }
      : {})
  };
  const { whereSql, params } = buildCampaignFilters(normalizedFilters);
  const paginationParams = [
    ...params,
    normalizedFilters.limit,
    (normalizedFilters.page - 1) * normalizedFilters.limit
  ];

  const campaignsResult = await queryFn<AdminCampaignRow>(
    [
      "SELECT",
      "  ppc.id,",
      "  u.username,",
      '  ppc.goal::text AS goal,',
      '  ppc.status::text AS status,',
      '  ppc."totalBudget" AS budget,',
      '  ppc."startDate" AS "startDate",',
      '  ppc."endDate" AS "endDate"',
      "FROM public.promote_post_campaign ppc",
      'INNER JOIN public."user" u ON u.id = ppc."userId"',
      whereSql,
      'ORDER BY ppc."createdAt" DESC, ppc.id DESC',
      `LIMIT $${params.length + 1}`,
      `OFFSET $${params.length + 2}`
    ].join("\n"),
    paginationParams
  );

  const totalResult = await queryFn<TotalCountRow>(
    [
      "SELECT",
      "  COUNT(*)::int AS total",
      "FROM public.promote_post_campaign ppc",
      'INNER JOIN public."user" u ON u.id = ppc."userId"',
      whereSql
    ].join("\n"),
    params
  );

  return {
    campaigns: campaignsResult.rows.map((campaign) => ({
      campaignId: mapRequiredIdAsString(campaign.id, "id"),
      username: mapRequiredText(campaign.username, "username"),
      goal: mapCampaignGoal(campaign.goal),
      status: mapCampaignStatus(campaign.status),
      budget: mapRequiredNumber(campaign.budget, "budget"),
      startDate: mapOptionalDate(campaign.startDate),
      endDate: mapOptionalDate(campaign.endDate)
    })),
    total: Number(totalResult.rows[0]?.total ?? 0)
  };
}
