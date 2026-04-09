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
