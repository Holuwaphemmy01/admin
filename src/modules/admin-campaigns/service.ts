import { randomUUID } from "node:crypto";

import { QueryResult, QueryResultRow } from "pg";

import { query, withTransaction } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  AdminCampaignStatusFilter,
  AdminCampaignDetailsResponse,
  AdminCampaignsListFilters,
  AdminCampaignsListResponse,
  ApproveAdminCampaignRequestBody,
  ApproveAdminCampaignResponse,
  PauseAdminCampaignRequestBody,
  PauseAdminCampaignResponse,
  RejectAdminCampaignRequestBody,
  RejectAdminCampaignResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminCampaignsServiceDependencies {
  queryFn?: QueryFunction;
  runInTransaction?: RunInTransaction;
  nowFactory?: () => Date;
  uuidFactory?: () => string;
}

interface TransactionClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

type RunInTransaction = <T>(operation: (client: TransactionClient) => Promise<T>) => Promise<T>;

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

interface AdminCampaignDetailsRow extends QueryResultRow {
  id: string | number;
  postId: string | number | null;
  username: string | null;
  goal: string | null;
  status: string | null;
  budget: string | number | null;
  impressions: string | number | null;
  clicks: string | number | null;
  conversions: string | number | null;
  createdAt: Date;
}

interface CampaignForApprovalRow extends QueryResultRow {
  id: string | number;
  status: string | null;
}

interface ApprovedCampaignRow extends QueryResultRow {
  id: string | number;
}

interface CampaignForPauseRow extends QueryResultRow {
  id: string | number;
  status: string | null;
}

interface PausedCampaignRow extends QueryResultRow {
  id: string | number;
}

interface CampaignForRejectionRow extends QueryResultRow {
  id: string | number;
  userId: string | number | null;
  status: string | null;
}

interface RejectedCampaignRow extends QueryResultRow {
  id: string | number;
}

export class AdminCampaignsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminCampaignsValidationError";
  }
}

export class AdminCampaignNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminCampaignNotFoundError";
  }
}

export class AdminCampaignApprovalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminCampaignApprovalConflictError";
  }
}

export class AdminCampaignRejectionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminCampaignRejectionConflictError";
  }
}

export class AdminCampaignPauseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminCampaignPauseConflictError";
  }
}

function getQueryFn(dependencies: AdminCampaignsServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getRunInTransaction(
  dependencies: AdminCampaignsServiceDependencies = {}
): RunInTransaction {
  if (dependencies.runInTransaction) {
    return dependencies.runInTransaction;
  }

  const queryFn = getQueryFn(dependencies);

  if (queryFn !== query) {
    return async <T>(operation: (client: TransactionClient) => Promise<T>) =>
      operation({
        query: queryFn
      });
  }

  return withTransaction;
}

function getNowFactory(dependencies: AdminCampaignsServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function getUuidFactory(dependencies: AdminCampaignsServiceDependencies = {}): () => string {
  return dependencies.uuidFactory ?? randomUUID;
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

function normalizeOptionalTextField(value: string | undefined, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new AdminCampaignsValidationError(
      `${fieldName} must be a non-empty string when provided`
    );
  }

  return normalizedValue;
}

function normalizeRequiredTextField(value: string, fieldName: string): string {
  if (typeof value !== "string") {
    throw new AdminCampaignsValidationError(
      `${fieldName} is required and must be a non-empty string`
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new AdminCampaignsValidationError(
      `${fieldName} is required and must be a non-empty string`
    );
  }

  return normalizedValue;
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

function mapRequiredNonNegativeInteger(
  value: string | number | null,
  fieldName: string
): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error(`Admin campaigns query returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapRequiredDate(value: Date, fieldName: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Admin campaigns query returned an invalid ${fieldName} value`);
  }

  return value.toISOString();
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

export async function getAdminCampaignDetails(
  campaignId: number,
  dependencies: AdminCampaignsServiceDependencies = {}
): Promise<AdminCampaignDetailsResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedCampaignId = normalizePositiveInteger(campaignId, "campaignId");
  const result = await queryFn<AdminCampaignDetailsRow>(
    [
      "SELECT",
      "  ppc.id,",
      '  ppc."postId" AS "postId",',
      "  u.username,",
      '  ppc.goal::text AS goal,',
      '  ppc.status::text AS status,',
      '  ppc."totalBudget" AS budget,',
      '  COALESCE(ppcs."actualImpressions", ppc."actualImpressions", impression_metrics.impressions, 0) AS impressions,',
      '  COALESCE(ppcs."actualClicks", ppc."actualClicks", click_metrics.clicks, 0) AS clicks,',
      '  COALESCE(engagement_metrics.conversions, 0) AS conversions,',
      '  ppc."createdAt" AS "createdAt"',
      "FROM public.promote_post_campaign ppc",
      'INNER JOIN public."user" u ON u.id = ppc."userId"',
      "LEFT JOIN LATERAL (",
      "  SELECT",
      '    ppcs."actualImpressions",',
      '    ppcs."actualClicks"',
      "  FROM public.promote_post_campaign_stats ppcs",
      '  WHERE ppcs."campaignId" = ppc.id',
      '  ORDER BY COALESCE(ppcs."daysRun", 0) DESC, COALESCE(ppcs."actualImpressions", 0) DESC',
      "  LIMIT 1",
      ") ppcs ON TRUE",
      "LEFT JOIN LATERAL (",
      "  SELECT COUNT(*)::bigint AS impressions",
      "  FROM public.promote_post_impression ppi",
      '  WHERE ppi."campaignId" = ppc.id',
      ") impression_metrics ON TRUE",
      "LEFT JOIN LATERAL (",
      "  SELECT COUNT(*)::bigint AS clicks",
      "  FROM public.promote_post_click ppclick",
      '  WHERE ppclick."campaignId" = ppc.id',
      ") click_metrics ON TRUE",
      "LEFT JOIN LATERAL (",
      "  SELECT COUNT(*)::bigint AS conversions",
      "  FROM public.promote_post_engagement ppe",
      '  WHERE ppe."campaignId" = ppc.id',
      ") engagement_metrics ON TRUE",
      "WHERE ppc.id = $1",
      "LIMIT 1"
    ].join("\n"),
    [normalizedCampaignId]
  );
  const campaign = result.rows[0];

  if (!campaign) {
    throw new AdminCampaignNotFoundError("Campaign not found");
  }

  return {
    campaignId: mapRequiredIdAsString(campaign.id, "id"),
    username: mapRequiredText(campaign.username, "username"),
    goal: mapCampaignGoal(campaign.goal),
    status: mapCampaignStatus(campaign.status),
    budget: mapRequiredNumber(campaign.budget, "budget"),
    impressions: mapRequiredNonNegativeInteger(campaign.impressions, "impressions"),
    clicks: mapRequiredNonNegativeInteger(campaign.clicks, "clicks"),
    conversions: mapRequiredNonNegativeInteger(campaign.conversions, "conversions"),
    postId: mapRequiredIdAsString(campaign.postId, "postId"),
    createdAt: mapRequiredDate(campaign.createdAt, "createdAt")
  };
}

export async function approveAdminCampaign(
  campaignId: number,
  payload: ApproveAdminCampaignRequestBody,
  dependencies: AdminCampaignsServiceDependencies = {}
): Promise<ApproveAdminCampaignResponse> {
  const queryFn = getQueryFn(dependencies);
  const now = getNowFactory(dependencies)();
  const normalizedCampaignId = normalizePositiveInteger(campaignId, "campaignId");

  normalizeOptionalTextField(payload.note, "note");

  const campaignResult = await queryFn<CampaignForApprovalRow>(
    [
      "SELECT",
      "  ppc.id,",
      '  ppc.status::text AS status',
      "FROM public.promote_post_campaign ppc",
      "WHERE ppc.id = $1",
      "LIMIT 1"
    ].join("\n"),
    [normalizedCampaignId]
  );
  const campaign = campaignResult.rows[0];

  if (!campaign) {
    throw new AdminCampaignNotFoundError("Campaign not found");
  }

  const normalizedStatus =
    typeof campaign.status === "string" ? campaign.status.trim().toLowerCase() : "";

  if (normalizedStatus === "active") {
    throw new AdminCampaignApprovalConflictError("Campaign is already active");
  }

  if (normalizedStatus === "pending_payment") {
    throw new AdminCampaignApprovalConflictError(
      "Campaign is awaiting payment and cannot be approved"
    );
  }

  if (
    normalizedStatus === "paused" ||
    normalizedStatus === "cancelled" ||
    normalizedStatus === "completed" ||
    normalizedStatus === "rejected"
  ) {
    throw new AdminCampaignApprovalConflictError(
      "Campaign cannot be approved from its current status"
    );
  }

  const approvedCampaignResult = await queryFn<ApprovedCampaignRow>(
    [
      "UPDATE public.promote_post_campaign",
      "SET",
      "  status = $1,",
      '  "startDate" = COALESCE("startDate", $2),',
      '  "updatedAt" = $3',
      "WHERE id = $4",
      "RETURNING id"
    ].join("\n"),
    ["active", now, now, normalizedCampaignId]
  );

  if (!approvedCampaignResult.rows[0]) {
    throw new Error("Campaign approval update did not return a row");
  }

  return {
    message: "Campaign approved and is now active"
  };
}

export async function rejectAdminCampaign(
  campaignId: number,
  payload: RejectAdminCampaignRequestBody,
  dependencies: AdminCampaignsServiceDependencies = {}
): Promise<RejectAdminCampaignResponse> {
  const runInTransaction = getRunInTransaction(dependencies);
  const now = getNowFactory(dependencies)();
  const uuidFactory = getUuidFactory(dependencies);
  const normalizedCampaignId = normalizePositiveInteger(campaignId, "campaignId");
  const normalizedReason = normalizeRequiredTextField(payload.reason, "reason");
  const actedByAdminUserId = normalizeCredentialValue(payload.actedByAdminUserId);

  if (actedByAdminUserId === "") {
    throw new AdminCampaignsValidationError("actedByAdminUserId is required");
  }

  return runInTransaction(async (client) => {
    const campaignResult = await client.query<CampaignForRejectionRow>(
      [
        "SELECT",
        "  ppc.id,",
        '  ppc."userId" AS "userId",',
        '  ppc.status::text AS status',
        "FROM public.promote_post_campaign ppc",
        "WHERE ppc.id = $1",
        "LIMIT 1",
        "FOR UPDATE"
      ].join("\n"),
      [normalizedCampaignId]
    );
    const campaign = campaignResult.rows[0];

    if (!campaign) {
      throw new AdminCampaignNotFoundError("Campaign not found");
    }

    const targetUserId = mapRequiredNonNegativeInteger(campaign.userId, "userId");
    const normalizedStatus =
      typeof campaign.status === "string" ? campaign.status.trim().toLowerCase() : "";

    if (normalizedStatus === "rejected") {
      throw new AdminCampaignRejectionConflictError("Campaign is already rejected");
    }

    if (
      normalizedStatus === "active" ||
      normalizedStatus === "paused" ||
      normalizedStatus === "cancelled" ||
      normalizedStatus === "completed"
    ) {
      throw new AdminCampaignRejectionConflictError(
        "Campaign cannot be rejected from its current status"
      );
    }

    const rejectedCampaignResult = await client.query<RejectedCampaignRow>(
      [
        "UPDATE public.promote_post_campaign",
        "SET",
        "  status = $1,",
        '  "updatedAt" = $2',
        "WHERE id = $3",
        "RETURNING id"
      ].join("\n"),
      ["rejected", now, normalizedCampaignId]
    );

    if (!rejectedCampaignResult.rows[0]) {
      throw new Error("Campaign rejection update did not return a row");
    }

    await client.query(
      [
        "INSERT INTO public.admin_campaign_rejection_audit_logs (",
        '  id, "campaignId", "targetUserId", "actedByAdminUserId", reason,',
        '  "previousStatus", "newStatus", "createdAt"',
        ") VALUES (",
        "  $1, $2, $3, $4, $5, $6, $7, $8",
        ")"
      ].join("\n"),
      [
        uuidFactory(),
        normalizedCampaignId,
        targetUserId,
        actedByAdminUserId,
        normalizedReason,
        normalizedStatus,
        "rejected",
        now
      ]
    );

    return {
      message: "Campaign rejected"
    };
  });
}

export async function pauseAdminCampaign(
  campaignId: number,
  payload: PauseAdminCampaignRequestBody,
  dependencies: AdminCampaignsServiceDependencies = {}
): Promise<PauseAdminCampaignResponse> {
  const queryFn = getQueryFn(dependencies);
  const now = getNowFactory(dependencies)();
  const normalizedCampaignId = normalizePositiveInteger(campaignId, "campaignId");

  normalizeOptionalTextField(payload.reason, "reason");

  const campaignResult = await queryFn<CampaignForPauseRow>(
    [
      "SELECT",
      "  ppc.id,",
      '  ppc.status::text AS status',
      "FROM public.promote_post_campaign ppc",
      "WHERE ppc.id = $1",
      "LIMIT 1"
    ].join("\n"),
    [normalizedCampaignId]
  );
  const campaign = campaignResult.rows[0];

  if (!campaign) {
    throw new AdminCampaignNotFoundError("Campaign not found");
  }

  const normalizedStatus =
    typeof campaign.status === "string" ? campaign.status.trim().toLowerCase() : "";

  if (normalizedStatus === "paused" || normalizedStatus === "cancelled") {
    throw new AdminCampaignPauseConflictError("Campaign is already paused");
  }

  if (
    normalizedStatus === "draft" ||
    normalizedStatus === "pending_payment" ||
    normalizedStatus === "completed" ||
    normalizedStatus === "rejected"
  ) {
    throw new AdminCampaignPauseConflictError("Campaign cannot be paused from its current status");
  }

  const pausedCampaignResult = await queryFn<PausedCampaignRow>(
    [
      "UPDATE public.promote_post_campaign",
      "SET",
      "  status = $1,",
      '  "updatedAt" = $2',
      "WHERE id = $3",
      "RETURNING id"
    ].join("\n"),
    ["paused", now, normalizedCampaignId]
  );

  if (!pausedCampaignResult.rows[0]) {
    throw new Error("Campaign pause update did not return a row");
  }

  return {
    message: "Campaign paused"
  };
}
