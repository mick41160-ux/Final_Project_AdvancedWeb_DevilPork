import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface DeliveryOrder {
  id: number;
  customer_id: number;
  box_count: number;
  status: 'pending' | 'ready' | 'assigned' | 'delivered' | 'cancelled';
  ordered_at: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface Rider {
  id: number;
  display_name: string;
  phone: string;
  is_available: boolean | number;
}

export interface PlanStop {
  order_id: number;
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  box_count: number;
  stop_sequence: number;
  estimated_arrival_at: string;
  distance_from_previous_km: number;
}

export interface PlanRoute {
  rider_id: number;
  rider_name: string;
  phone: string;
  distance_km: number;
  box_count: number;
  delivery_cost: number;
  estimated_minutes: number;
  estimated_arrival_at: string;
  distance_source: 'road' | 'straight';
  geometry: [number, number][];
  stops: PlanStop[];
}

export interface RoutingPlan {
  id: number | null;
  status: string;
  planned_departure: string;
  finish_deadline: string;
  assumptions: {
    distance_model: string;
    speed_kmh: number;
    stop_minutes: number;
    max_stops_per_rider: number;
    rider_fee: number;
    cost_per_km_per_box: number;
  };
  summary: {
    order_count: number;
    total_order_count: number;
    unassigned_order_ids: number[];
    rider_count: number;
    total_distance_km: number;
    estimated_finish_at: string;
    meets_deadline: boolean;
    fallback_count: number;
    revenue: number;
    food_cost: number;
    delivery_cost: number;
    estimated_profit: number;
  };
  routes: PlanRoute[];
}

export interface LatestRoutingPlan {
  active_plan: {
    routes: Array<{
      rider_id: number | null;
      stops: Array<{ order_id: number; stop_sequence: number }>;
    }>;
  } | null;
}

import { environment } from '../environments/environment';

declare global {
  interface Window {
    __APP_CONFIG__?: { apiUrl?: string };
  }
}

const API_URL = typeof window !== 'undefined' && window.__APP_CONFIG__?.apiUrl
  ? window.__APP_CONFIG__.apiUrl.replace(/\/$/, '')
  : environment.apiUrl.replace(/\/$/, '');

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${API_URL}/api/customer`);
  }

  updateCustomer(id: number, customer: Omit<Customer, 'id'>): Observable<{ affected_rows: number }> {
    return this.http.put<{ affected_rows: number }>(`${API_URL}/api/customer/${id}`, customer);
  }

  deleteCustomer(id: number): Observable<{ affected_rows: number }> {
    return this.http.delete<{ affected_rows: number }>(`${API_URL}/api/customer/${id}`);
  }

  getOrders(): Observable<DeliveryOrder[]> {
    return this.http.get<DeliveryOrder[]>(`${API_URL}/api/order`);
  }

  getRiders(): Observable<Rider[]> {
    return this.http.get<Rider[]>(`${API_URL}/api/rider`);
  }

  getLatestRoutingPlan(): Observable<LatestRoutingPlan> {
    return this.http.get<LatestRoutingPlan>(`${API_URL}/api/routing/latest`);
  }

  updateOrder(id: number, update: Partial<Pick<DeliveryOrder, 'status' | 'box_count'>>): Observable<{ affected_rows: number }> {
    return this.http.put<{ affected_rows: number }>(`${API_URL}/api/order/${id}`, update);
  }

  deleteOrder(id: number): Observable<{ affected_rows: number }> {
    return this.http.delete<{ affected_rows: number }>(`${API_URL}/api/order/${id}`);
  }

  calculateRoute(
    plannedDeparture: string,
    speedKmh?: number,
    stopMinutes?: number,
  ): Observable<{ active_plan: RoutingPlan }> {
    return this.http.post<{ active_plan: RoutingPlan }>(`${API_URL}/api/routing/calculate`, {
      planned_departure: plannedDeparture,
      speed_kmh: speedKmh,
      stop_minutes: stopMinutes,
    });
  }

  commitRoute(
    plannedDeparture: string,
    speedKmh?: number,
    stopMinutes?: number,
  ): Observable<{ active_plan: RoutingPlan }> {
    return this.http.post<{ active_plan: RoutingPlan }>(`${API_URL}/api/routing/commit`, {
      planned_departure: plannedDeparture,
      speed_kmh: speedKmh,
      stop_minutes: stopMinutes,
    });
  }
}
