export type OrderStatus =
  "pending" | "ready" | "assigned" | "delivered" | "cancelled";

export interface Order {
  id?: number;
  customer_id: number;
  box_count: number;
  status?: OrderStatus;
  ordered_at?: string;
}
