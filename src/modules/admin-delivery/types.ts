export type DeliveryVehicleType = "bike" | "car" | "truck";

export interface DeliveryPricingRecord {
  id: number;
  state: string;
  vehicleType: DeliveryVehicleType;
  baseFee: number;
}

export interface CreateDeliveryPricingRequestBody {
  state: string;
  vehicleType: DeliveryVehicleType;
  baseFee: number;
}

export interface CreateDeliveryPricingResponse {
  message: string;
  data: DeliveryPricingRecord;
}

export interface UpdateDeliveryPricingRequestBody {
  id: number;
  state?: string;
  vehicleType?: DeliveryVehicleType;
  baseFee?: number;
}

export interface UpdateDeliveryPricingResponse {
  message: string;
  data: DeliveryPricingRecord;
}

export interface ListDeliveryPricingFilters {
  state?: string;
  vehicleType?: DeliveryVehicleType;
}

export interface ListDeliveryPricingResponse {
  pricingRules: DeliveryPricingRecord[];
}
