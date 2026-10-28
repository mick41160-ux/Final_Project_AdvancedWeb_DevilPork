import { ChangeDetectorRef, Component, inject, AfterViewInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, DeliveryOrder, Rider } from '../api.service';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';

type LatLng = [number, number];

async function getRoadGeometry(points: LatLng[]): Promise<LatLng[]> {
  if (points.length < 2) return points;
  const coords = points.map(p => `${p[1]},${p[0]}`).join(';');
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
      return data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]] as LatLng);
    }
  } catch (e) {
    console.error('OSRM fallback routing failed', e);
  }
  return points;
}

@Component({
  imports: [RouterLink],
  selector: 'app-store',
  styleUrl: './store.css',
  templateUrl: './store.html',
})
export class StoreComponent implements AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  
  orders: DeliveryOrder[] = [];
  riders: Rider[] = [];
  loading = true;
  error = '';

  private map?: L.Map;
  private mapLayer = L.layerGroup();

  constructor() {
    this.api.getOrders().subscribe({
      next: (orders) => { this.orders = orders; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.error = 'โหลดข้อมูลภาพรวมไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ API'; this.loading = false; this.cdr.markForCheck(); },
    });
    this.api.getRiders().subscribe({ next: (riders) => { this.riders = riders; this.cdr.markForCheck(); } });
  }

  ngAfterViewInit(): void {
    this.map = L.map('storeMap', { zoomControl: false }).setView([16.2468, 103.2514], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(this.map);
    this.mapLayer.addTo(this.map);

    this.loadRouteMap();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  async loadRouteMap(): Promise<void> {
    try {
      const depot: LatLng = [16.2468, 103.2514];
      
      L.circle(depot, {
        color: '#94a3b8',
        fillColor: '#cbd5e1',
        fillOpacity: 0.2,
        weight: 1.5,
        dashArray: '5, 5',
        radius: 3000
      }).addTo(this.mapLayer);

      const depotIcon = L.divIcon({
       className: 'custom-depot-marker',
        html: `<div style="background-color: #1e3a8a; color: white; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); text-align: center; white-space: nowrap;">ครัว</div>`,
        iconSize: [40, 24],
        iconAnchor: [20, 12] 
      });

L.marker(depot, { icon: depotIcon }).addTo(this.mapLayer).bindPopup('จุดเริ่มต้น: ครัว');

      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const { active_plan } = await firstValueFrom(this.api.calculateRoute(`${date} 11:30`, 30, 4));

      const colors = ['#2563eb', '#059669', '#e11d48', '#d97706', '#7c3aed', '#0891b2'];

      for (let idx = 0; idx < active_plan.routes.length; idx++) {
        const r = active_plan.routes[idx];
        const color = colors[idx % colors.length];
        const waypoints: LatLng[] = [depot, ...r.stops.map((s: any) => [Number(s.latitude), Number(s.longitude)] as LatLng)];
        
        let geom: LatLng[] = r.geometry?.length ? r.geometry : waypoints;

        if (r.distance_source === 'straight' || geom.length === waypoints.length) {
          geom = await getRoadGeometry(waypoints);
        }

        L.polyline(geom, { color, weight: 4, opacity: 0.8 }).addTo(this.mapLayer);

        r.stops.forEach((s: any) => {
          L.circleMarker([Number(s.latitude), Number(s.longitude)], {
            color, 
            fillColor: '#ffffff', 
            fillOpacity: 1, 
            radius: 5, 
            weight: 2
          }).addTo(this.mapLayer).bindPopup(`ลูกค้า: ${s.first_name}<br>ออเดอร์: ${s.box_count} กล่อง`);
        });
      }
    } catch (e) {
      console.error('Failed to load routes on dashboard', e);
    }
  }

  get totalBoxes(): number { return this.orders.reduce((sum, order) => sum + Number(order.box_count), 0); }
  get readyRiders(): Rider[] { return this.riders.filter((rider) => rider.is_available === true || rider.is_available === 1); }
  countStatus(status: DeliveryOrder['status']): number { return this.orders.filter((order) => order.status === status).length; }
  customerName(order: DeliveryOrder): string { return `${order.first_name} ${order.last_name}`; }
}
