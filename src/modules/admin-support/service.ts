import { randomUUID } from "node:crypto";

import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import {
  CloseAdminSupportTicketRequest,
  CloseAdminSupportTicketResponse,
  CreateAdminSupportCategoryRequest,
  CreateAdminSupportCategoryResponse,
  AdminSupportTicketDetailsResponse,
  AdminSupportTicketReplySignedParams,
  AdminSupportTicketStatusFilter,
  AdminSupportTicketsListFilters,
  AdminSupportTicketsListResponse,
  ReplyToAdminSupportTicketRequest,
  ReplyToAdminSupportTicketResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface CreateAdminSupportReplySignedParamsInput {
  attachmentFileType: string;
  attachmentKey: string;
  ticketId: number;
}

type CreateAdminSupportReplySignedParams = (
  input: CreateAdminSupportReplySignedParamsInput
) =>
  | Promise<AdminSupportTicketReplySignedParams | null>
  | AdminSupportTicketReplySignedParams
  | null;

interface AdminSupportServiceDependencies {
  queryFn?: QueryFunction;
  nowFactory?: () => Date;
  uuidFactory?: () => string;
  createReplySignedParams?: CreateAdminSupportReplySignedParams;
}

interface AdminSupportTicketRow extends QueryResultRow {
  id: string | number;
  username: string | null;
  subject: string | null;
  status: string | number | null;
  createdAt: Date;
}

interface AdminSupportCategoryRow extends QueryResultRow {
  id: string | number;
  name: string | null;
  description: string | null;
}

interface TotalCountRow extends QueryResultRow {
  total: number;
}

interface AdminSupportTicketDetailsRow extends QueryResultRow {
  id: string | number;
  userId: string | number | null;
  ticketCategoryId: string | number | null;
  username: string | null;
  owner: string | null;
  subject: string | null;
  message: string | null;
  attachment: string | null;
  attachmentFileType: string | null;
  reply: boolean | null;
  status: string | number | null;
  createdAt: Date;
}

interface AdminSupportTicketInsertRow extends QueryResultRow {
  id: string | number;
}

interface AdminSupportTicketThread {
  subject: string | null;
  rows: AdminSupportTicketDetailsRow[];
}

export class AdminSupportTicketsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSupportTicketsValidationError";
  }
}

export class AdminSupportTicketNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSupportTicketNotFoundError";
  }
}

export class AdminSupportCategoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSupportCategoryConflictError";
  }
}

function getQueryFn(dependencies: AdminSupportServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getNowFactory(
  dependencies: AdminSupportServiceDependencies = {}
): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function getUuidFactory(
  dependencies: AdminSupportServiceDependencies = {}
): () => string {
  return dependencies.uuidFactory ?? randomUUID;
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AdminSupportTicketsValidationError(`${fieldName} must be a positive integer`);
  }

  return value;
}

function normalizeOptionalStatus(
  value: string | undefined
): AdminSupportTicketStatusFilter | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "open" && value !== "closed" && value !== "pending") {
    throw new AdminSupportTicketsValidationError(
      "status must be one of open, closed, pending"
    );
  }

  return value;
}

function normalizeOptionalUsername(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new AdminSupportTicketsValidationError(
      "username must be a non-empty string when provided"
    );
  }

  return normalizedValue;
}

function normalizeRequiredMessage(value: string): string {
  if (typeof value !== "string") {
    throw new AdminSupportTicketsValidationError("message is required and must be a non-empty string");
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new AdminSupportTicketsValidationError("message is required and must be a non-empty string");
  }

  return normalizedValue;
}

function normalizeRequiredSupportCategoryText(
  value: string,
  fieldName: "name" | "description"
): string {
  if (typeof value !== "string") {
    throw new AdminSupportTicketsValidationError(
      `${fieldName} is required and must be a non-empty string`
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new AdminSupportTicketsValidationError(
      `${fieldName} is required and must be a non-empty string`
    );
  }

  return normalizedValue;
}

function normalizeOptionalAttachmentFileType(
  value: string | undefined
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AdminSupportTicketsValidationError(
      "attachmentFileType must be a non-empty string when provided"
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new AdminSupportTicketsValidationError(
      "attachmentFileType must be a non-empty string when provided"
    );
  }

  return normalizedValue;
}

function normalizeOptionalResolution(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AdminSupportTicketsValidationError(
      "resolution must be a non-empty string when provided"
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new AdminSupportTicketsValidationError(
      "resolution must be a non-empty string when provided"
    );
  }

  return normalizedValue;
}

function mapRequiredInteger(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error(`Admin support tickets query returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapOptionalInteger(
  value: string | number | null | undefined,
  fieldName: string
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error(`Admin support tickets query returned an invalid ${fieldName} value`);
  }

  return numericValue;
}

function mapRequiredText(value: string | null | undefined, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`Admin support tickets query returned an invalid ${fieldName} value`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new Error(`Admin support tickets query returned an invalid ${fieldName} value`);
  }

  return normalizedValue;
}

function mapRequiredDate(value: Date, fieldName: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Admin support tickets query returned an invalid ${fieldName} value`);
  }

  return value.toISOString();
}

function mapOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue === "" ? null : normalizedValue;
}

function mapRequiredBoolean(value: boolean | null | undefined, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Admin support tickets query returned an invalid ${fieldName} value`);
  }

  return value;
}

function mapTicketStatus(
  value: string | number | null | undefined
): AdminSupportTicketStatusFilter {
  const numericValue =
    value === null || value === undefined
      ? null
      : typeof value === "number"
        ? value
        : Number(value);

  if (numericValue === 1) {
    return "open";
  }

  if (numericValue === 2) {
    return "pending";
  }

  return "closed";
}

function mapStoredTicketStatusValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 1;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error("Admin support tickets query returned an invalid status value");
  }

  return numericValue;
}

function isClosedTicketStatus(value: string | number | null | undefined): boolean {
  const numericValue = mapStoredTicketStatusValue(value);

  return numericValue !== 1 && numericValue !== 2;
}

function buildSupportTicketFilters(filters: AdminSupportTicketsListFilters): {
  whereSql: string;
  params: unknown[];
} {
  const clauses = ["1 = 1"];
  const params: unknown[] = [];
  const usernameSql = `COALESCE(NULLIF(BTRIM(u.username), ''), NULLIF(BTRIM(st.owner), ''))`;

  if (typeof filters.status === "string") {
    if (filters.status === "open") {
      params.push(1);
      clauses.push(`COALESCE(st.status, 1) = $${params.length}`);
    } else if (filters.status === "pending") {
      params.push(2);
      clauses.push(`COALESCE(st.status, 1) = $${params.length}`);
    } else {
      clauses.push("COALESCE(st.status, 1) <> 1");
      clauses.push("COALESCE(st.status, 1) <> 2");
    }
  }

  if (typeof filters.username === "string") {
    params.push(filters.username);
    clauses.push(`${usernameSql} IS NOT NULL`);
    clauses.push(`LOWER(${usernameSql}) = LOWER($${params.length})`);
  }

  if (typeof filters.categoryId === "number") {
    params.push(filters.categoryId);
    clauses.push(`st."ticketCategoryId" = $${params.length}`);
  }

  return {
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params
  };
}

function getAdminSupportTicketSelectLines(): string[] {
  return [
    "SELECT",
    "  st.id,",
    '  st."userId" AS "userId",',
    '  st."ticketCategoryId" AS "ticketCategoryId",',
    `  COALESCE(NULLIF(BTRIM(u.username), ''), NULLIF(BTRIM(st.owner), '')) AS username,`,
    "  st.owner,",
    "  st.subject,",
    "  st.message,",
    "  st.attachment,",
    '  st."attachmentFileType" AS "attachmentFileType",',
    "  st.reply,",
    "  st.status,",
    '  st."createdAt" AS "createdAt"',
    "FROM public.support_ticket st",
    'LEFT JOIN public."user" u ON u.id = st."userId"'
  ];
}

async function getAdminSupportTicketRow(
  ticketId: number,
  queryFn: QueryFunction
): Promise<AdminSupportTicketDetailsRow> {
  const targetResult = await queryFn<AdminSupportTicketDetailsRow>(
    [...getAdminSupportTicketSelectLines(), "WHERE st.id = $1", "LIMIT 1"].join("\n"),
    [ticketId]
  );
  const targetTicket = targetResult.rows[0];

  if (!targetTicket) {
    throw new AdminSupportTicketNotFoundError("Support ticket not found");
  }

  return targetTicket;
}

async function listAdminSupportTicketThreadRows(
  targetTicket: AdminSupportTicketDetailsRow,
  queryFn: QueryFunction
): Promise<AdminSupportTicketDetailsRow[]> {
  const targetUserId = mapOptionalInteger(targetTicket.userId, "userId");

  if (targetUserId !== null) {
    const threadRowsResult = await queryFn<AdminSupportTicketDetailsRow>(
      [
        ...getAdminSupportTicketSelectLines(),
        'WHERE st."userId" = $1',
        'ORDER BY st."createdAt" ASC, st.id ASC'
      ].join("\n"),
      [targetUserId]
    );

    return threadRowsResult.rows;
  }

  const targetOwner = mapOptionalText(targetTicket.owner);

  if (targetOwner !== null) {
    const threadRowsResult = await queryFn<AdminSupportTicketDetailsRow>(
      [
        ...getAdminSupportTicketSelectLines(),
        "WHERE LOWER(BTRIM(st.owner)) = LOWER($1)",
        'ORDER BY st."createdAt" ASC, st.id ASC'
      ].join("\n"),
      [targetOwner]
    );

    return threadRowsResult.rows;
  }

  return [targetTicket];
}

function groupAdminSupportTicketThreads(
  rows: AdminSupportTicketDetailsRow[]
): AdminSupportTicketThread[] {
  const groupedThreads: AdminSupportTicketThread[] = [];

  for (const row of rows) {
    const normalizedSubject = mapOptionalText(row.subject);
    const currentThread = groupedThreads[groupedThreads.length - 1];

    if (!currentThread) {
      groupedThreads.push({
        subject: normalizedSubject,
        rows: [row]
      });
      continue;
    }

    if (normalizedSubject === null) {
      currentThread.rows.push(row);
      continue;
    }

    if (
      currentThread.subject === null ||
      normalizedSubject.toLowerCase() === currentThread.subject.toLowerCase()
    ) {
      if (currentThread.subject === null) {
        currentThread.subject = normalizedSubject;
      }

      currentThread.rows.push(row);
      continue;
    }

    groupedThreads.push({
      subject: normalizedSubject,
      rows: [row]
    });
  }

  return groupedThreads;
}

function resolveAdminSupportTicketThread(
  targetTicketId: number,
  targetTicket: AdminSupportTicketDetailsRow,
  threadRows: AdminSupportTicketDetailsRow[]
): AdminSupportTicketThread {
  const groupedThreads = groupAdminSupportTicketThreads(threadRows);

  return (
    groupedThreads.find((thread) =>
      thread.rows.some((row) => mapRequiredInteger(row.id, "id") === targetTicketId)
    ) ?? {
      subject: mapOptionalText(targetTicket.subject),
      rows: [targetTicket]
    }
  );
}

function resolveAdminSupportTicketSubject(
  targetTicket: AdminSupportTicketDetailsRow,
  thread: AdminSupportTicketThread
): string {
  return (
    thread.subject ??
    mapOptionalText(targetTicket.subject) ??
    mapRequiredText(targetTicket.message, "message")
  );
}

export async function listAdminSupportTickets(
  filters: AdminSupportTicketsListFilters,
  dependencies: AdminSupportServiceDependencies = {}
): Promise<AdminSupportTicketsListResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedFilters: AdminSupportTicketsListFilters = {
    page: normalizePositiveInteger(filters.page, "page"),
    limit: normalizePositiveInteger(filters.limit, "limit"),
    ...(filters.status !== undefined
      ? { status: normalizeOptionalStatus(filters.status) }
      : {}),
    ...(filters.username !== undefined
      ? { username: normalizeOptionalUsername(filters.username) }
      : {}),
    ...(filters.categoryId !== undefined
      ? { categoryId: normalizePositiveInteger(filters.categoryId, "categoryId") }
      : {})
  };
  const { whereSql, params } = buildSupportTicketFilters(normalizedFilters);
  const paginationParams = [
    ...params,
    normalizedFilters.limit,
    (normalizedFilters.page - 1) * normalizedFilters.limit
  ];

  const ticketsResult = await queryFn<AdminSupportTicketRow>(
    [
      "SELECT",
      "  st.id,",
      `  COALESCE(NULLIF(BTRIM(u.username), ''), NULLIF(BTRIM(st.owner), '')) AS username,`,
      "  st.subject,",
      "  st.status,",
      '  st."createdAt" AS "createdAt"',
      "FROM public.support_ticket st",
      'LEFT JOIN public."user" u ON u.id = st."userId"',
      whereSql,
      'ORDER BY st."createdAt" DESC, st.id DESC',
      `LIMIT $${params.length + 1}`,
      `OFFSET $${params.length + 2}`
    ].join("\n"),
    paginationParams
  );

  const totalResult = await queryFn<TotalCountRow>(
    [
      "SELECT",
      "  COUNT(*)::int AS total",
      "FROM public.support_ticket st",
      'LEFT JOIN public."user" u ON u.id = st."userId"',
      whereSql
    ].join("\n"),
    params
  );

  return {
    tickets: ticketsResult.rows.map((ticket) => ({
      id: mapRequiredInteger(ticket.id, "id"),
      username: mapRequiredText(ticket.username, "username"),
      subject: mapRequiredText(ticket.subject, "subject"),
      status: mapTicketStatus(ticket.status),
      createdAt: mapRequiredDate(ticket.createdAt, "createdAt")
    })),
    total: Number(totalResult.rows[0]?.total ?? 0)
  };
}

export async function createAdminSupportCategory(
  payload: CreateAdminSupportCategoryRequest,
  dependencies: AdminSupportServiceDependencies = {}
): Promise<CreateAdminSupportCategoryResponse> {
  const queryFn = getQueryFn(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const normalizedName = normalizeRequiredSupportCategoryText(payload.name, "name");
  const normalizedDescription = normalizeRequiredSupportCategoryText(
    payload.description,
    "description"
  );

  const existingCategoryResult = await queryFn<AdminSupportCategoryRow>(
    [
      "SELECT",
      "  stc.id",
      "FROM public.support_ticket_category stc",
      "WHERE stc.name IS NOT NULL",
      "  AND BTRIM(stc.name) <> ''",
      "  AND LOWER(BTRIM(stc.name)) = LOWER(BTRIM($1))",
      "  AND COALESCE(stc.status, 1) = 1",
      "LIMIT 1"
    ].join("\n"),
    [normalizedName]
  );

  if ((existingCategoryResult.rowCount ?? 0) > 0) {
    throw new AdminSupportCategoryConflictError(
      "A support category with this name already exists"
    );
  }

  const timestamp = nowFactory();

  try {
    const createdCategoryResult = await queryFn<AdminSupportCategoryRow>(
      [
        "INSERT INTO public.support_ticket_category (",
        '  name, description, status, "createdAt", "updatedAt"',
        ") VALUES (",
        "  $1, $2, $3, $4, $5",
        ")",
        "RETURNING id"
      ].join("\n"),
      [normalizedName, normalizedDescription, 1, timestamp, timestamp]
    );

    if (!createdCategoryResult.rows[0]) {
      throw new Error("Support category insert did not return a row");
    }
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new AdminSupportCategoryConflictError(
        "A support category with this name already exists"
      );
    }

    throw error;
  }

  const categoriesResult = await queryFn<AdminSupportCategoryRow>(
    [
      "SELECT",
      "  stc.id,",
      "  stc.name,",
      "  stc.description",
      "FROM public.support_ticket_category stc",
      "WHERE COALESCE(stc.status, 1) = 1",
      "ORDER BY LOWER(BTRIM(stc.name)) ASC, stc.id ASC"
    ].join("\n")
  );

  return {
    tickets: categoriesResult.rows.map((category) => ({
      id: mapRequiredInteger(category.id, "id"),
      name: mapRequiredText(category.name, "name"),
      description: mapRequiredText(category.description, "description")
    }))
  };
}

export async function getAdminSupportTicketDetails(
  ticketId: number,
  dependencies: AdminSupportServiceDependencies = {}
): Promise<AdminSupportTicketDetailsResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedTicketId = normalizePositiveInteger(ticketId, "ticketId");
  const targetTicket = await getAdminSupportTicketRow(normalizedTicketId, queryFn);
  const threadRows = await listAdminSupportTicketThreadRows(targetTicket, queryFn);
  const matchingThread = resolveAdminSupportTicketThread(
    normalizedTicketId,
    targetTicket,
    threadRows
  );
  const resolvedSubject = resolveAdminSupportTicketSubject(targetTicket, matchingThread);
  const resolvedUsername = mapRequiredText(targetTicket.username, "username");

  return {
    ticket: {
      id: mapRequiredInteger(targetTicket.id, "id"),
      username: resolvedUsername,
      subject: resolvedSubject,
      messages: matchingThread.rows.map((row) => ({
        id: mapRequiredInteger(row.id, "id"),
        message: mapRequiredText(row.message, "message"),
        attachment: mapOptionalText(row.attachment),
        attachmentFileType: mapOptionalText(row.attachmentFileType),
        reply: mapRequiredBoolean(row.reply, "reply"),
        createdAt: mapRequiredDate(row.createdAt, "createdAt")
      })),
      status: mapTicketStatus(targetTicket.status),
      createdAt: mapRequiredDate(targetTicket.createdAt, "createdAt")
    }
  };
}

export async function replyToAdminSupportTicket(
  payload: ReplyToAdminSupportTicketRequest,
  dependencies: AdminSupportServiceDependencies = {}
): Promise<ReplyToAdminSupportTicketResponse> {
  const queryFn = getQueryFn(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const uuidFactory = getUuidFactory(dependencies);
  const normalizedPayload: ReplyToAdminSupportTicketRequest = {
    ticketId: normalizePositiveInteger(payload.ticketId, "ticketId"),
    message: normalizeRequiredMessage(payload.message),
    ...(payload.attachmentFileType !== undefined
      ? {
          attachmentFileType: normalizeOptionalAttachmentFileType(
            payload.attachmentFileType
          )
        }
      : {})
  };
  const targetTicket = await getAdminSupportTicketRow(normalizedPayload.ticketId, queryFn);
  const threadRows = await listAdminSupportTicketThreadRows(targetTicket, queryFn);
  const matchingThread = resolveAdminSupportTicketThread(
    normalizedPayload.ticketId,
    targetTicket,
    threadRows
  );
  const resolvedSubject = resolveAdminSupportTicketSubject(targetTicket, matchingThread);
  const targetUserId = mapOptionalInteger(targetTicket.userId, "userId");
  const targetCategoryId = mapOptionalInteger(
    targetTicket.ticketCategoryId,
    "ticketCategoryId"
  );
  const targetOwner =
    mapOptionalText(targetTicket.owner) ?? mapOptionalText(targetTicket.username);
  const targetStatus = mapStoredTicketStatusValue(targetTicket.status);
  const createdAt = nowFactory();
  let attachment: string | null = null;
  let attachmentFileType: string | null = null;
  let signedParams: AdminSupportTicketReplySignedParams | null = null;

  if (typeof normalizedPayload.attachmentFileType === "string") {
    const attachmentKey = `support/tickets/${normalizedPayload.ticketId}/replies/${uuidFactory()}`;
    const createReplySignedParams = dependencies.createReplySignedParams;

    if (createReplySignedParams) {
      signedParams = await createReplySignedParams({
        attachmentFileType: normalizedPayload.attachmentFileType,
        attachmentKey,
        ticketId: normalizedPayload.ticketId
      });
    }

    if (signedParams) {
      attachment = attachmentKey;
      attachmentFileType = normalizedPayload.attachmentFileType;
    }
  }

  const insertResult = await queryFn<AdminSupportTicketInsertRow>(
    [
      "INSERT INTO public.support_ticket (",
      '  "userId",',
      '  "ticketCategoryId",',
      "  subject,",
      "  message,",
      "  attachment,",
      '  "attachmentFileType",',
      "  owner,",
      "  reply,",
      "  status,",
      '  "createdAt",',
      '  "updatedAt"',
      ")",
      "VALUES (",
      "  $1,",
      "  $2,",
      "  $3,",
      "  $4,",
      "  $5,",
      "  $6,",
      "  $7,",
      "  $8,",
      "  $9,",
      "  $10,",
      "  $11",
      ")",
      "RETURNING id"
    ].join("\n"),
    [
      targetUserId,
      targetCategoryId,
      resolvedSubject,
      normalizedPayload.message,
      attachment,
      attachmentFileType,
      targetOwner,
      true,
      targetStatus,
      createdAt,
      createdAt
    ]
  );

  if (!insertResult.rows[0]) {
    throw new Error("Support ticket reply insert did not return a row");
  }

  return {
    signedParams
  };
}

export async function closeAdminSupportTicket(
  payload: CloseAdminSupportTicketRequest,
  dependencies: AdminSupportServiceDependencies = {}
): Promise<CloseAdminSupportTicketResponse> {
  const queryFn = getQueryFn(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const normalizedPayload: CloseAdminSupportTicketRequest = {
    ticketId: normalizePositiveInteger(payload.ticketId, "ticketId"),
    ...(payload.resolution !== undefined
      ? {
          resolution: normalizeOptionalResolution(payload.resolution)
        }
      : {})
  };
  const targetTicket = await getAdminSupportTicketRow(normalizedPayload.ticketId, queryFn);
  const threadRows = await listAdminSupportTicketThreadRows(targetTicket, queryFn);
  const matchingThread = resolveAdminSupportTicketThread(
    normalizedPayload.ticketId,
    targetTicket,
    threadRows
  );
  const resolvedSubject = resolveAdminSupportTicketSubject(targetTicket, matchingThread);
  const openThreadRowIds = matchingThread.rows
    .filter((row) => !isClosedTicketStatus(row.status))
    .map((row) => mapRequiredInteger(row.id, "id"));

  if (openThreadRowIds.length > 0) {
    const updatedAt = nowFactory();

    await queryFn<AdminSupportTicketInsertRow>(
      [
        "UPDATE public.support_ticket",
        'SET status = $1, "updatedAt" = $2',
        "WHERE id = ANY($3::int[])",
        "RETURNING id"
      ].join("\n"),
      [0, updatedAt, openThreadRowIds]
    );

    if (typeof normalizedPayload.resolution === "string") {
      const targetUserId = mapOptionalInteger(targetTicket.userId, "userId");
      const targetCategoryId = mapOptionalInteger(
        targetTicket.ticketCategoryId,
        "ticketCategoryId"
      );
      const targetOwner =
        mapOptionalText(targetTicket.owner) ?? mapOptionalText(targetTicket.username);

      const insertResult = await queryFn<AdminSupportTicketInsertRow>(
        [
          "INSERT INTO public.support_ticket (",
          '  "userId",',
          '  "ticketCategoryId",',
          "  subject,",
          "  message,",
          "  attachment,",
          '  "attachmentFileType",',
          "  owner,",
          "  reply,",
          "  status,",
          '  "createdAt",',
          '  "updatedAt"',
          ")",
          "VALUES (",
          "  $1,",
          "  $2,",
          "  $3,",
          "  $4,",
          "  $5,",
          "  $6,",
          "  $7,",
          "  $8,",
          "  $9,",
          "  $10,",
          "  $11",
          ")",
          "RETURNING id"
        ].join("\n"),
        [
          targetUserId,
          targetCategoryId,
          resolvedSubject,
          normalizedPayload.resolution,
          null,
          null,
          targetOwner,
          true,
          0,
          updatedAt,
          updatedAt
        ]
      );

      if (!insertResult.rows[0]) {
        throw new Error("Support ticket resolution insert did not return a row");
      }
    }
  }

  return {
    message: "Ticket closed successfully"
  };
}
