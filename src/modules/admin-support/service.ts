import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import {
  AdminSupportTicketStatusFilter,
  AdminSupportTicketDetailsResponse,
  AdminSupportTicketsListFilters,
  AdminSupportTicketsListResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminSupportServiceDependencies {
  queryFn?: QueryFunction;
}

interface AdminSupportTicketRow extends QueryResultRow {
  id: string | number;
  username: string | null;
  subject: string | null;
  status: string | number | null;
  createdAt: Date;
}

interface TotalCountRow extends QueryResultRow {
  total: number;
}

interface AdminSupportTicketDetailsRow extends QueryResultRow {
  id: string | number;
  userId: string | number | null;
  username: string | null;
  subject: string | null;
  message: string | null;
  attachment: string | null;
  attachmentFileType: string | null;
  reply: boolean | null;
  status: string | number | null;
  createdAt: Date;
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

function getQueryFn(dependencies: AdminSupportServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
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

function mapRequiredInteger(value: string | number | null, fieldName: string): number {
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

export async function getAdminSupportTicketDetails(
  ticketId: number,
  dependencies: AdminSupportServiceDependencies = {}
): Promise<AdminSupportTicketDetailsResponse> {
  const queryFn = getQueryFn(dependencies);
  const normalizedTicketId = normalizePositiveInteger(ticketId, "ticketId");

  const targetResult = await queryFn<AdminSupportTicketDetailsRow>(
    [
      "SELECT",
      "  st.id,",
      '  st."userId" AS "userId",',
      `  COALESCE(NULLIF(BTRIM(u.username), ''), NULLIF(BTRIM(st.owner), '')) AS username,`,
      "  st.subject,",
      "  st.message,",
      "  st.attachment,",
      '  st."attachmentFileType" AS "attachmentFileType",',
      "  st.reply,",
      "  st.status,",
      '  st."createdAt" AS "createdAt"',
      "FROM public.support_ticket st",
      'LEFT JOIN public."user" u ON u.id = st."userId"',
      "WHERE st.id = $1",
      "LIMIT 1"
    ].join("\n"),
    [normalizedTicketId]
  );
  const targetTicket = targetResult.rows[0];

  if (!targetTicket) {
    throw new AdminSupportTicketNotFoundError("Support ticket not found");
  }

  const targetUserId = mapRequiredInteger(targetTicket.userId, "userId");

  const threadRowsResult = await queryFn<AdminSupportTicketDetailsRow>(
    [
      "SELECT",
      "  st.id,",
      '  st."userId" AS "userId",',
      `  COALESCE(NULLIF(BTRIM(u.username), ''), NULLIF(BTRIM(st.owner), '')) AS username,`,
      "  st.subject,",
      "  st.message,",
      "  st.attachment,",
      '  st."attachmentFileType" AS "attachmentFileType",',
      "  st.reply,",
      "  st.status,",
      '  st."createdAt" AS "createdAt"',
      "FROM public.support_ticket st",
      'LEFT JOIN public."user" u ON u.id = st."userId"',
      'WHERE st."userId" = $1',
      'ORDER BY st."createdAt" ASC, st.id ASC'
    ].join("\n"),
    [targetUserId]
  );

  const groupedThreads: Array<{
    subject: string | null;
    rows: AdminSupportTicketDetailsRow[];
  }> = [];

  for (const row of threadRowsResult.rows) {
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

    if (currentThread.subject === null || normalizedSubject.toLowerCase() === currentThread.subject.toLowerCase()) {
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

  const matchingThread =
    groupedThreads.find((thread) =>
      thread.rows.some((row) => mapRequiredInteger(row.id, "id") === normalizedTicketId)
    ) ??
    {
      subject: mapOptionalText(targetTicket.subject),
      rows: [targetTicket]
    };

  const resolvedSubject =
    matchingThread.subject ??
    mapOptionalText(targetTicket.subject) ??
    mapRequiredText(targetTicket.message, "message");

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
