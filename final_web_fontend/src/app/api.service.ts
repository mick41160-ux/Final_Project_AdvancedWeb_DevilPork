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

// Use the local API while developing locally. Production deployments can set
// window.__APP_CONFIG__.apiUrl before Angular starts to provide their API URL.
declare global {
  interface Window {
    __APP_CONFIG__?: { apiUrl?: string };
  }
}

const isLocal = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_URL = typeof window !== 'undefined' && window.__APP_CONFIG__?.apiUrl
  ? window.__APP_CONFIG__.apiUrl.replace(/\/$/, '')
  : isLocal ? 'http://localhost:3000' : 'https://finalwebprojectapi.vercel.app';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${API_URL}/api/customer`);
  }

  getOrders(): Observable<DeliveryOrder[]> {
    return this.http.get<DeliveryOrder[]>(`${API_URL}/api/order`);
  }

  getRiders(): Observable<Rider[]> {
    return this.http.get<Rider[]>(`${API_URL}/api/rider`);
  }

  updateOrder(id: number, update: Partial<Pick<DeliveryOrder, 'status' | 'box_count'>>): Observable<{ affected_rows: number }> {
    return this.http.put<{ affected_rows: number }>(`${API_URL}/api/order/${id}`, update);
  }

  deleteOrder(id: number): Observable<{ affected_rows: number }> {
    return this.http.delete<{ affected_rows: number }>(`${API_URL}/api/order/${id}`);
  }
}
