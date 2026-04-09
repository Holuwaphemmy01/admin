import { QueryResult, QueryResultRow } from "pg";

import { query } from "../../config/db";
import { normalizeCredentialValue } from "../admin-auth/utils";
import {
  CreateDeliveryPricingRequestBody,
  CreateDeliveryPricingResponse,
  DeliveryVehicleType
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

function normalizeVehicleType(
  value: DeliveryVehicleType,
  ErrorType: MessageErrorConstructor
): DeliveryVehicleType {
  if (value !== "bike" && value !== "car" && value !== "truck") {
    throw new ErrorType("vehicleType must be one of bike, car, truck");
  }

  return value;
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

function mapRequiredInteger(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error(`Created delivery pricing returned an invalid ${fieldName}`);
  }

  return numericValue;
}

function mapRequiredText(value: string | null, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`Created delivery pricing returned an invalid ${fieldName}`);
  }

  const normalizedValue = normalizeCredentialValue(value);

  if (normalizedValue === "") {
    throw new Error(`Created delivery pricing returned an invalid ${fieldName}`);
  }

  return normalizedValue;
}

function mapRequiredVehicleType(value: string | null): DeliveryVehicleType {
  if (value !== "bike" && value !== "car" && value !== "truck") {
    throw new Error("Created delivery pricing returned an invalid vehicleType");
  }

  return value;
}

function mapRequiredNumber(value: string | number | null, fieldName: string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Created delivery pricing returned an invalid ${fieldName}`);
  }

  return numericValue;
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
      id: mapRequiredInteger(createdPricing.id, "id"),
      state: mapRequiredText(createdPricing.state, "state"),
      vehicleType: mapRequiredVehicleType(createdPricing.vehicleType),
      baseFee: mapRequiredNumber(createdPricing.baseFee, "baseFee")
    }
  };
}
