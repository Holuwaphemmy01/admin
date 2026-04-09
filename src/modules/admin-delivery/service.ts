import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  CreateDeliveryPricingRequestBody,
  CreateDeliveryPricingResponse,
  DeleteDeliveryPricingRequestBody,
  DeleteDeliveryPricingResponse,
  DeliverySurgeOverviewResponse,
  DeliveryVehicleType,
  ListDeliveryPricingFilters,
  ListDeliveryPricingResponse,
  UpdateDeliverySurgeRequestBody,
  UpdateDeliverySurgeResponse,
  UpdateDeliveryPricingRequestBody,
  UpdateDeliveryPricingResponse
} from "./types";

type QueryFunction = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

interface AdminDeliveryServiceDependencies {
  queryFn?: QueryFunction;
  nowFactory?: () => Date;
}

interface ExistingDeliveryPricingRow extends QueryResultRow {
  id: number;
}

interface CreatedDeliveryPricingRow extends QueryResultRow {
  id: number;
  state: string | null;
  vehicleType: string | null;
  baseFee: string | number | null;
}

interface DeliveryPricingListRow extends QueryResultRow {
  id: number;
  state: string | null;
  vehicleType: string | null;
  baseFee: string | number | null;
}

interface DeliveryPricingForUpdateRow extends QueryResultRow {
  id: number;
  state: string | null;
  vehicleType: string | null;
  baseFee: string | number | null;
}

interface DeliveryGeneralSurgeRow extends QueryResultRow {
  rate: string | number | null;
  condition: string | null;
  updatedAt: Date | null;
}

interface DeliveryFuelSurgeRow extends QueryResultRow {
  fuelSurcharge: string | number | null;
  updatedAt: Date | null;
}

interface DeliveryCurrentSurgeConfigRow extends QueryResultRow {
  surgeFactor: string | number | null;
  fuelSurcharge: string | number | null;
  reason: string | null;
  updatedAt: Date | null;
}

type MessageErrorConstructor = new (message: string) => Error;

export class DeliveryPricingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryPricingValidationError";
  }
}

export class DeliveryPricingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryPricingConflictError";
  }
}

export class DeliveryPricingNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryPricingNotFoundError";
  }
}

export class DeliverySurgeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliverySurgeValidationError";
  }
}

function getQueryFn(dependencies: AdminDeliveryServiceDependencies = {}): QueryFunction {
  return dependencies.queryFn ?? query;
}

function getNowFactory(dependencies: AdminDeliveryServiceDependencies = {}): () => Date {
  return dependencies.nowFactory ?? (() => new Date());
}

function normalizeRequiredTextField(
  value: string,
  fieldName: string,
  ErrorType: MessageErrorConstructor
): string {
  if (typeof value !== "string") {
    throw new ErrorType(`${fieldName} is required and must be a non-empty string`);
  }

  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new ErrorType(`${fieldName} is required and must be a non-empty string`);
  }

  return normalizedValue;
}

function normalizeOptionalTextField(
  value: string | undefined,
  fieldName: string,
  ErrorType: MessageErrorConstructor
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeRequiredTextField(value, fieldName, ErrorType);
}

function normalizeVehicleType(
  value: DeliveryVehicleType,
  ErrorType: MessageErrorConstructor
): DeliveryVehicleType {
  if (value !== "bike" && value !== "car" && value !== "truck") {
    throw new ErrorType("vehicleType must be one of bike, car, truck");
  }

  return value;
}

function normalizeOptionalVehicleType(
  value: DeliveryVehicleType | undefined,
  ErrorType: MessageErrorConstructor
): DeliveryVehicleType | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeVehicleType(value, ErrorType);
}

function normalizeBaseFee(value: number, ErrorType: MessageErrorConstructor): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    Math.abs(value - Number(value.toFixed(2))) > Number.EPSILON
  ) {
    throw new ErrorType(
      "baseFee is required and must be a non-negative finite number with at most 2 decimal places"
    );
  }

  return value;
}

function normalizeOptionalBaseFee(
  value: number | undefined,
  ErrorType: MessageErrorConstructor
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeBaseFee(value, ErrorType);
}

function normalizeSurgeFactor(value: number, ErrorType: MessageErrorConstructor): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 1 ||
    Math.abs(value - Number(value.toFixed(2))) > Number.EPSILON
  ) {
    throw new ErrorType(
      "surgeFactor is required and must be a finite number greater than or equal to 1 with at most 2 decimal places"
    );
  }

  return value;
}

function normalizeOptionalFuelSurcharge(
  value: number | undefined,
  ErrorType: MessageErrorConstructor
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    Math.abs(value - Number(value.toFixed(2))) > Number.EPSILON
  ) {
    throw new ErrorType(
      "fuelSurcharge must be a non-negative finite number with at most 2 decimal places when provided"
    );
  }

  return value;
}

function normalizePricingId(value: number, ErrorType: MessageErrorConstructor): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ErrorType("id must be a positive integer");
  }

  return value;
}

function mapPositiveInteger(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error(`Delivery pricing returned an invalid ${fieldName}`);
  }

  return numericValue;
}

function mapNormalizedText(value: string | null, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`Delivery pricing returned an invalid ${fieldName}`);
  }

  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new Error(`Delivery pricing returned an invalid ${fieldName}`);
  }

  return normalizedValue;
}

function mapDeliveryVehicleType(value: string | null): DeliveryVehicleType {
  if (value !== "bike" && value !== "car" && value !== "truck") {
    throw new Error("Delivery pricing returned an invalid vehicleType");
  }

  return value;
}

function mapFiniteNumber(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Delivery pricing returned an invalid ${fieldName}`);
  }

  return numericValue;
}

function mapDateOrNull(value: Date | null): string | null {
  if (value === null) {
    return null;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Delivery surge returned an invalid updatedAt value");
  }

  return value.toISOString();
}

function normalizeOptionalStoredText(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = normalizeCredentialValue(value);

  return normalizedValue === "" ? null : normalizedValue;
}

function isPostgresErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function getCurrentDeliverySurgeConfig(
  queryFn: QueryFunction,
  options: { allowMissingTable?: boolean } = {}
): Promise<DeliveryCurrentSurgeConfigRow | null> {
  const { allowMissingTable = false } = options;

  try {
    const currentConfigResult = await queryFn<DeliveryCurrentSurgeConfigRow>(
      [
        "SELECT",
        '  dcs."surgeFactor" AS "surgeFactor",',
        '  dcs."fuelSurcharge" AS "fuelSurcharge",',
        "  dcs.reason,",
        '  dcs."updatedAt" AS "updatedAt"',
        "FROM public.delivery_current_surge_config dcs",
        "WHERE dcs.id = 1",
        "LIMIT 1"
      ].join("\n")
    );

    return currentConfigResult.rows[0] ?? null;
  } catch (error) {
    if (allowMissingTable && isPostgresErrorWithCode(error, "42P01")) {
      return null;
    }

    throw error;
  }
}

function mapDeliverySurgeOverviewFromConfig(
  row: DeliveryCurrentSurgeConfigRow
): DeliverySurgeOverviewResponse {
  return {
    surgeFactor: mapFiniteNumber(row.surgeFactor, "surgeFactor"),
    fuelSurcharge: Number(mapFiniteNumber(row.fuelSurcharge, "fuelSurcharge").toFixed(2)),
    reason: normalizeOptionalStoredText(row.reason),
    updatedAt: mapDateOrNull(row.updatedAt)
  };
}

export async function getDeliverySurgeOverview(
  dependencies: AdminDeliveryServiceDependencies = {}
): Promise<DeliverySurgeOverviewResponse> {
  const queryFn = getQueryFn(dependencies);
  const currentConfig = await getCurrentDeliverySurgeConfig(queryFn, {
    allowMissingTable: true
  });

  if (currentConfig !== null) {
    return mapDeliverySurgeOverviewFromConfig(currentConfig);
  }

  const [generalResult, fuelResult] = await Promise.all([
    queryFn<DeliveryGeneralSurgeRow>(
      [
        "SELECT",
        '  dgs.condition, dgs.rate, dgs."updatedAt"',
        "FROM public.delivery_general_surge_surcharge dgs",
        "WHERE COALESCE(dgs.status, 1) = 1",
        "ORDER BY dgs.rate DESC NULLS LAST, dgs.\"updatedAt\" DESC NULLS LAST, dgs.id DESC",
        "LIMIT 1"
      ].join("\n")
    ),
    queryFn<DeliveryFuelSurgeRow>(
      [
        "SELECT",
        '  GREATEST(dfs.\"currentFuelPrice\" - dfs.\"baseFuelPrice\", 0) * dfs.\"consumptionRates\" AS \"fuelSurcharge\",',
        '  dfs."updatedAt"',
        "FROM public.delivery_fuel_surge_surcharge dfs",
        "WHERE COALESCE(dfs.status, 1) = 1",
        'ORDER BY "fuelSurcharge" DESC NULLS LAST, dfs."updatedAt" DESC NULLS LAST, dfs.id DESC',
        "LIMIT 1"
      ].join("\n")
    )
  ]);

  const generalRow = generalResult.rows[0];
  const fuelRow = fuelResult.rows[0];
  const surgeFactor = generalRow?.rate === null || generalRow?.rate === undefined
    ? 1
    : mapFiniteNumber(generalRow.rate, "surgeFactor");
  const fuelSurchargeRaw =
    fuelRow?.fuelSurcharge === null || fuelRow?.fuelSurcharge === undefined
      ? 0
      : mapFiniteNumber(fuelRow.fuelSurcharge, "fuelSurcharge");
  const fuelSurcharge = Number(fuelSurchargeRaw.toFixed(2));
  const generalUpdatedAt = mapDateOrNull(generalRow?.updatedAt ?? null);
  const fuelUpdatedAt = mapDateOrNull(fuelRow?.updatedAt ?? null);
  const updatedAtCandidates = [generalUpdatedAt, fuelUpdatedAt]
    .filter((value): value is string => typeof value === "string")
    .sort();
  const latestUpdatedAt =
    updatedAtCandidates.length > 0 ? updatedAtCandidates[updatedAtCandidates.length - 1] : null;
  const normalizedReason = normalizeOptionalStoredText(generalRow?.condition ?? null);

  return {
    surgeFactor,
    fuelSurcharge,
    reason: surgeFactor > 1 ? normalizedReason : null,
    updatedAt: latestUpdatedAt
  };
}

export async function updateDeliverySurge(
  payload: UpdateDeliverySurgeRequestBody,
  dependencies: AdminDeliveryServiceDependencies = {}
): Promise<UpdateDeliverySurgeResponse> {
  const queryFn = getQueryFn(dependencies);
  const now = getNowFactory(dependencies)();
  const surgeFactor = normalizeSurgeFactor(payload.surgeFactor, DeliverySurgeValidationError);
  const normalizedFuelSurcharge = normalizeOptionalFuelSurcharge(
    payload.fuelSurcharge,
    DeliverySurgeValidationError
  );
  const normalizedReason =
    payload.reason === undefined
      ? undefined
      : normalizeOptionalTextField(payload.reason, "reason", DeliverySurgeValidationError) ?? null;
  const existingConfig = await getCurrentDeliverySurgeConfig(queryFn);
  const fuelSurcharge =
    normalizedFuelSurcharge ??
    (existingConfig === null
      ? 0
      : Number(mapFiniteNumber(existingConfig.fuelSurcharge, "fuelSurcharge").toFixed(2)));
  const reason =
    normalizedReason === undefined
      ? normalizeOptionalStoredText(existingConfig?.reason ?? null)
      : normalizedReason;
  const updateResult = await queryFn<DeliveryCurrentSurgeConfigRow>(
    [
      "INSERT INTO public.delivery_current_surge_config (",
      '  id, "surgeFactor", "fuelSurcharge", reason, "createdAt", "updatedAt"',
      ")",
      "VALUES ($1, $2, $3, $4, $5, $5)",
      "ON CONFLICT (id) DO UPDATE",
      "SET",
      '  "surgeFactor" = EXCLUDED."surgeFactor",',
      '  "fuelSurcharge" = EXCLUDED."fuelSurcharge",',
      "  reason = EXCLUDED.reason,",
      '  "updatedAt" = EXCLUDED."updatedAt"',
      'RETURNING "surgeFactor" AS "surgeFactor", "fuelSurcharge" AS "fuelSurcharge", reason, "updatedAt" AS "updatedAt"'
    ].join("\n"),
    [1, surgeFactor, fuelSurcharge, reason, now]
  );
  const updatedConfig = updateResult.rows[0];

  if (!updatedConfig) {
    throw new Error("Delivery surge update did not return a row");
  }

  return {
    message: "Surge updated",
    surgeFactor: mapFiniteNumber(updatedConfig.surgeFactor, "surgeFactor")
  };
}

function mapDeliveryPricingRecord(
  row: DeliveryPricingForUpdateRow | CreatedDeliveryPricingRow | DeliveryPricingListRow
): UpdateDeliveryPricingResponse["data"] {
  return {
    id: mapPositiveInteger(row.id, "id"),
    state: mapNormalizedText(row.state, "state"),
    vehicleType: mapDeliveryVehicleType(row.vehicleType),
    baseFee: mapFiniteNumber(row.baseFee, "baseFee")
  };
}

export async function listDeliveryPricing(
  filters: ListDeliveryPricingFilters = {},
  dependencies: AdminDeliveryServiceDependencies = {}
): Promise<ListDeliveryPricingResponse> {
  const queryFn = getQueryFn(dependencies);
  const state = normalizeOptionalTextField(
    filters.state,
    "state",
    DeliveryPricingValidationError
  );
  const vehicleType = normalizeOptionalVehicleType(
    filters.vehicleType,
    DeliveryPricingValidationError
  );
  const queryParams: unknown[] = [];
  const whereClauses: string[] = [];

  if (state !== undefined) {
    queryParams.push(state);
    whereClauses.push(`LOWER(BTRIM(dp.state)) = LOWER(BTRIM($${queryParams.length}))`);
  }

  if (vehicleType !== undefined) {
    queryParams.push(vehicleType);
    whereClauses.push(`dp."vehicleType"::text = $${queryParams.length}`);
  }

  const pricingResult = await queryFn<DeliveryPricingListRow>(
    [
      "SELECT",
      '  dp.id, dp.state, dp."vehicleType"::text AS "vehicleType", dp."baseFee"',
      "FROM public.delivery_pricings dp",
      whereClauses.length > 0 ? `WHERE ${whereClauses.join("\n  AND ")}` : "",
      'ORDER BY LOWER(BTRIM(dp.state)) ASC, dp."vehicleType"::text ASC, dp.id ASC'
    ]
      .filter((statementPart) => statementPart !== "")
      .join("\n"),
    queryParams
  );

  return {
    pricingRules: pricingResult.rows.map((pricingRule) => mapDeliveryPricingRecord(pricingRule))
  };
}

export async function updateDeliveryPricing(
  payload: UpdateDeliveryPricingRequestBody,
  dependencies: AdminDeliveryServiceDependencies = {}
): Promise<UpdateDeliveryPricingResponse> {
  const queryFn = getQueryFn(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const id = normalizePricingId(payload.id, DeliveryPricingValidationError);
  const state = normalizeOptionalTextField(
    payload.state,
    "state",
    DeliveryPricingValidationError
  );
  const vehicleType = normalizeOptionalVehicleType(
    payload.vehicleType,
    DeliveryPricingValidationError
  );
  const baseFee = normalizeOptionalBaseFee(payload.baseFee, DeliveryPricingValidationError);

  if (state === undefined && vehicleType === undefined && baseFee === undefined) {
    throw new DeliveryPricingValidationError(
      "At least one delivery pricing field must be provided for update"
    );
  }

  const existingPricingResult = await queryFn<DeliveryPricingForUpdateRow>(
    [
      "SELECT",
      '  dp.id, dp.state, dp."vehicleType"::text AS "vehicleType", dp."baseFee"',
      "FROM public.delivery_pricings dp",
      "WHERE dp.id = $1",
      "LIMIT 1"
    ].join("\n"),
    [id]
  );

  const existingPricing = existingPricingResult.rows[0];

  if (!existingPricing) {
    throw new DeliveryPricingNotFoundError("Delivery pricing not found");
  }

  const resolvedState = state ?? mapNormalizedText(existingPricing.state, "state");
  const resolvedVehicleType =
    vehicleType ?? mapDeliveryVehicleType(existingPricing.vehicleType);
  const resolvedBaseFee = baseFee ?? mapFiniteNumber(existingPricing.baseFee, "baseFee");

  if (state !== undefined || vehicleType !== undefined) {
    const duplicatePricingResult = await queryFn<ExistingDeliveryPricingRow>(
      [
        "SELECT",
        "  dp.id",
        "FROM public.delivery_pricings dp",
        "WHERE LOWER(BTRIM(dp.state)) = LOWER(BTRIM($1))",
        '  AND dp."vehicleType"::text = $2',
        "  AND dp.id <> $3",
        "LIMIT 1"
      ].join("\n"),
      [resolvedState, resolvedVehicleType, id]
    );

    if ((duplicatePricingResult.rowCount ?? 0) > 0) {
      throw new DeliveryPricingConflictError(
        "Delivery pricing already exists for the provided state and vehicle type"
      );
    }
  }

  const updatedPricingResult = await queryFn<DeliveryPricingForUpdateRow>(
    [
      "UPDATE public.delivery_pricings",
      'SET state = $1,',
      '    "vehicleType" = $2::public."enum_delivery_pricings_vehicleType",',
      '    "baseFee" = $3,',
      '    "updatedAt" = $4',
      "WHERE id = $5",
      'RETURNING id, state, "vehicleType"::text AS "vehicleType", "baseFee"'
    ].join("\n"),
    [resolvedState, resolvedVehicleType, resolvedBaseFee, nowFactory(), id]
  );

  const updatedPricing = updatedPricingResult.rows[0];

  if (!updatedPricing) {
    throw new DeliveryPricingNotFoundError("Delivery pricing not found");
  }

  return {
    message: "Delivery pricing updated successfully",
    data: mapDeliveryPricingRecord(updatedPricing)
  };
}

export async function deleteDeliveryPricing(
  payload: DeleteDeliveryPricingRequestBody,
  dependencies: AdminDeliveryServiceDependencies = {}
): Promise<DeleteDeliveryPricingResponse> {
  const queryFn = getQueryFn(dependencies);
  const id = normalizePricingId(payload.id, DeliveryPricingValidationError);

  const deletedPricingResult = await queryFn<ExistingDeliveryPricingRow>(
    [
      "DELETE FROM public.delivery_pricings",
      "WHERE id = $1",
      "RETURNING id"
    ].join("\n"),
    [id]
  );

  const deletedPricing = deletedPricingResult.rows[0];

  if (!deletedPricing) {
    throw new DeliveryPricingNotFoundError("Delivery pricing not found");
  }

  return {
    message: "Pricing rule removed"
  };
}

export async function createDeliveryPricing(
  payload: CreateDeliveryPricingRequestBody,
  dependencies: AdminDeliveryServiceDependencies = {}
): Promise<CreateDeliveryPricingResponse> {
  const queryFn = getQueryFn(dependencies);
  const nowFactory = getNowFactory(dependencies);
  const state = normalizeRequiredTextField(
    payload.state,
    "state",
    DeliveryPricingValidationError
  );
  const vehicleType = normalizeVehicleType(
    payload.vehicleType,
    DeliveryPricingValidationError
  );
  const baseFee = normalizeBaseFee(payload.baseFee, DeliveryPricingValidationError);

  const existingPricingResult = await queryFn<ExistingDeliveryPricingRow>(
    [
      "SELECT",
      "  dp.id",
      "FROM public.delivery_pricings dp",
      "WHERE LOWER(BTRIM(dp.state)) = LOWER(BTRIM($1))",
      '  AND dp."vehicleType"::text = $2',
      "LIMIT 1"
    ].join("\n"),
    [state, vehicleType]
  );

  if ((existingPricingResult.rowCount ?? 0) > 0) {
    throw new DeliveryPricingConflictError(
      "Delivery pricing already exists for the provided state and vehicle type"
    );
  }

  const now = nowFactory();
  const createdPricingResult = await queryFn<CreatedDeliveryPricingRow>(
    [
      "INSERT INTO public.delivery_pricings (",
      '  state, "vehicleType", "baseFee", status, "createdAt", "updatedAt"',
      ") VALUES (",
      '  $1, $2::public."enum_delivery_pricings_vehicleType", $3, $4, $5, $6',
      ")",
      'RETURNING id, state, "vehicleType"::text AS "vehicleType", "baseFee"'
    ].join("\n"),
    [state, vehicleType, baseFee, 1, now, now]
  );

  const createdPricing = createdPricingResult.rows[0];

  if (!createdPricing) {
    throw new Error("Delivery pricing insert did not return a row");
  }

  return {
    message: "Delivery pricing added successfully",
    data: mapDeliveryPricingRecord(createdPricing)
  };
}
