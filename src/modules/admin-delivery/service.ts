import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  CreateDeliveryPricingRequestBody,
  CreateDeliveryPricingResponse,
  DeliveryVehicleType,
  ListDeliveryPricingFilters,
  ListDeliveryPricingResponse
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
    pricingRules: pricingResult.rows.map((pricingRule) => ({
      id: mapPositiveInteger(pricingRule.id, "id"),
      state: mapNormalizedText(pricingRule.state, "state"),
      vehicleType: mapDeliveryVehicleType(pricingRule.vehicleType),
      baseFee: mapFiniteNumber(pricingRule.baseFee, "baseFee")
    }))
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
    data: {
      id: mapPositiveInteger(createdPricing.id, "id"),
      state: mapNormalizedText(createdPricing.state, "state"),
      vehicleType: mapDeliveryVehicleType(createdPricing.vehicleType),
      baseFee: mapFiniteNumber(createdPricing.baseFee, "baseFee")
    }
  };
}
