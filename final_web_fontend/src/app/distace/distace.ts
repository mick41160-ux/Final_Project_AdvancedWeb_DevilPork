import { AfterViewInit, Component, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';
import { ApiService, PlanRoute, PlanStop } from '../api.service';

type LatLng = [number, number];

const DEPOT: LatLng = [16.2468, 103.2514];

export const RIDER_COLORS = [
  '#2563eb',
  '#059669',
  '#e11d48',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#c026d3',
  '#65a30d',
  '#475569',
  '#ea580c',
];

export interface RiderView {
  riderId: number;
  riderName: string;
  phone: string;
  color: string;
  boxCount: number;
  stops: PlanStop[];
  geometry: LatLng[];
  legsKm: number[];
  source: 'road' | 'straight';
  roadKm: number;
  minutes: number;
  cost: number;
  finishAt: string;
  stopViews: { stop: PlanStop; km: number; arrival: string }[];
}

function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function bearingDeg(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x =
    Math.cos(rad(a[0])) * Math.sin(rad(b[0])) -
    Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const clock = (dateTime: string) => dateTime.slice(11, 16);

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
  selector: 'app-distace',
  styleUrl: './distace.css',
  templateUrl: './distace.html',
})
export class Distace implements AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private map?: L.Map;
  private layer = L.layerGroup();
  private lines = new Map<number, L.Polyline[]>();
  private bounds = new Map<number, L.LatLngBounds>();
  private requestId = 0;
  private debounce?: ReturnType<typeof setTimeout>;

  readonly speedKmh = signal(30);
  readonly stopMinutes = signal(4);
  readonly departure = signal('11:30');

  readonly loading = signal(false);
  readonly committing = signal(false);
  readonly commitMessage = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly routes = signal<RiderView[]>([]);
  readonly summary = signal({
    riders: 0,
    km: 0,
    finish: '--:--',
    meetsDeadline: true,
    revenue: 0,
    food: 0,
    delivery: 0,
    fallbackCount: 0,
  });
  readonly meta = signal({ totalOrders: 0, assigned: 0, unassigned: 0, deadline: '12:30' });
  readonly expandedRider = signal<number | null>(null);
  readonly activeRider = signal<number | null>(null);

  ngAfterViewInit(): void {
    const map = L.map('routeMap', { zoomControl: true }).setView(DEPOT, 14);
    this.map = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    this.layer.addTo(map);

    void this.calculate();
  }

  ngOnDestroy(): void {
    clearTimeout(this.debounce);
    this.map?.remove();
  }

  setSpeed(value: string): void {
    const n = Number(value);
    if (n > 0) {
      this.speedKmh.set(n);
      this.scheduleCalculate();
    }
  }

  setStopMinutes(value: string): void {
    const n = Number(value);
    if (n >= 0) {
      this.stopMinutes.set(n);
      this.scheduleCalculate();
    }
  }

  setDeparture(value: string): void {
    if (/^\d{2}:\d{2}$/.test(value)) {
      this.departure.set(value);
      this.scheduleCalculate();
    }
  }

  private scheduleCalculate(): void {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.calculate(), 400);
  }

  toggleExpand(riderId: number): void {
    const open = this.expandedRider() === riderId;
    this.expandedRider.set(open ? null : riderId);
    if (!open) this.focusRider(riderId);
  }

  focusRider(riderId: number): void {
    const map = this.map;
    if (!map) return;
    const same = this.activeRider() === riderId;
    this.activeRider.set(same ? null : riderId);
    const active = same ? null : riderId;
    this.lines.forEach((layers, id) => {
      const dim = active !== null && id !== active;
      layers.forEach((l, i) => l.setStyle({ opacity: dim ? 0.15 : i === 0 ? 1 : 0.9 }));
    });
    const b = active !== null ? this.bounds.get(active) : this.allBounds();
    if (b?.isValid()) map.fitBounds(b, { padding: [40, 40] });
  }

  async calculate(): Promise<void> {
    const ticket = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const { active_plan: plan } = await firstValueFrom(
        this.api.calculateRoute(`${date} ${this.departure()}`, this.speedKmh(), this.stopMinutes()),
      );
      if (ticket !== this.requestId) return;

      const views = plan.routes.map((r, i) => this.toView(r, i));

      for (const v of views) {
        if (v.source === 'straight' || v.geometry.length === v.stops.length + 1) {
          const waypoints: LatLng[] = [DEPOT, ...v.stops.map(s => [Number(s.latitude), Number(s.longitude)] as LatLng)];
          const roadGeom = await getRoadGeometry(waypoints);
          
          v.geometry = roadGeom;
          
          if (roadGeom.length > waypoints.length) {
            v.source = 'road'; 
          }
        }
      }

      const s = plan.summary;
      this.routes.set(views);
      this.summary.set({
        riders: s.rider_count,
        km: s.total_distance_km,
        finish: views.length ? clock(s.estimated_finish_at) : '--:--',
        meetsDeadline: s.meets_deadline,
        revenue: s.revenue,
        food: s.food_cost,
        delivery: s.delivery_cost,
        fallbackCount: s.fallback_count ?? 0,
      });
      this.meta.set({
        totalOrders: s.total_order_count,
        assigned: s.order_count,
        unassigned: s.unassigned_order_ids.length,
        deadline: clock(plan.finish_deadline) || '12:30',
      });
      this.activeRider.set(null);
      this.expandedRider.set(null);
      try {
        this.draw(views);
      } catch (drawError) {
        console.error('Map drawing failed', drawError, views);
        this.error.set('ได้ข้อมูลเส้นทางแล้ว แต่วาดแผนที่ไม่สำเร็จ ดูรายละเอียดใน Console (F12)');
      }
    } catch (e) {
      if (ticket !== this.requestId) return;
      console.error('Route calculation failed', e);
      this.error.set('คำนวณเส้นทางไม่สำเร็จ ตรวจสอบการเชื่อมต่อ API แล้วลองใหม่อีกครั้ง');
    } finally {
      if (ticket === this.requestId) this.loading.set(false);
    }
  }

  async confirmRoute(): Promise<void> {
    if (this.loading() || this.committing() || this.routes().length === 0) return;

    this.committing.set(true);
    this.commitMessage.set(null);
    this.error.set(null);
    try {
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      await firstValueFrom(
        this.api.commitRoute(`${date} ${this.departure()}`, this.speedKmh(), this.stopMinutes()),
      );
      this.commitMessage.set('บันทึกแผนแล้ว ไรเดอร์จะเห็นเฉพาะออเดอร์ที่ได้รับมอบหมายหลังล็อกอิน');
    } catch (e) {
      console.error('Route commit failed', e);
      this.error.set('บันทึกแผนจัดส่งไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      this.committing.set(false);
    }
  }

  private toView(r: PlanRoute, index: number): RiderView {
    const geometry: LatLng[] = r.geometry?.length
      ? r.geometry
      : [DEPOT, ...r.stops.map((s): LatLng => [Number(s.latitude), Number(s.longitude)])];

    return {
      riderId: r.rider_id,
      riderName: r.rider_name,
      phone: r.phone,
      color: RIDER_COLORS[index % RIDER_COLORS.length],
      boxCount: r.box_count,
      stops: r.stops,
      geometry,
      legsKm: r.stops.map((s) => s.distance_from_previous_km),
      source: r.distance_source ?? 'straight',
      roadKm: r.distance_km,
      minutes: r.estimated_minutes,
      cost: r.delivery_cost,
      finishAt: clock(r.estimated_arrival_at),
      stopViews: r.stops.map((s) => ({
        stop: s,
        km: s.distance_from_previous_km,
        arrival: clock(s.estimated_arrival_at),
      })),
    };
  }

  private allBounds(): L.LatLngBounds | undefined {
    let all: L.LatLngBounds | undefined;
    this.bounds.forEach((b) => (all = all ? all.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast())));
    return all;
  }

  private draw(routes: RiderView[]): void {
    const map = this.map;
    if (!map) return;
    this.layer.clearLayers();
    this.lines.clear();
    this.bounds.clear();

    L.circle(DEPOT, {
      color: '#94a3b8',
      fillColor: '#cbd5e1',
      fillOpacity: 0.2,
      weight: 1.5,
      dashArray: '5, 5',
      radius: 3000,
    }).addTo(this.layer);

    L.marker(DEPOT, {
      icon: L.divIcon({
        className: 'route-marker route-marker--depot',
        html: '<span>ครัว</span>',
        iconSize: [42, 28],
        iconAnchor: [21, 14],
      }),
      zIndexOffset: 1000,
    })
      .addTo(this.layer)
      .bindPopup('จุดเริ่มต้น: ครัว');

    for (const r of routes) {
      try {
      const dashed = r.source === 'straight' ? '8 8' : undefined;
      const casing = L.polyline(r.geometry, { color: '#ffffff', weight: 9, opacity: 0.9, dashArray: dashed });
      const line = L.polyline(r.geometry, { color: r.color, weight: 5, opacity: 0.95, dashArray: dashed });
      casing.addTo(this.layer);
      line.addTo(this.layer);
      line.bindTooltip(`${r.riderName} · ${r.roadKm.toFixed(2)} กม.`, { sticky: true });
      line.on('click', () => this.focusRider(r.riderId));
      this.lines.set(r.riderId, [casing, line]);
      this.bounds.set(r.riderId, L.latLngBounds(r.geometry));

      this.drawArrows(r);

      r.stops.forEach((s) => {
        L.marker([Number(s.latitude), Number(s.longitude)], {
          icon: L.divIcon({
            className: 'route-marker route-marker--stop',
            html: `<span>${s.stop_sequence}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        })
          .addTo(this.layer)
          .bindPopup(
            `<b>${r.riderName}</b> · จุดที่ ${s.stop_sequence}<br>${s.first_name} ${s.last_name}<br>${s.address}<br>${s.box_count} กล่อง`,
          )
          .getElement()
          ?.style.setProperty('--rider-color', r.color);
      });
      } catch (e) {
        console.error(`Drawing rider ${r.riderId} failed`, e, r.geometry);
      }
    }

    const all = this.allBounds();
    if (all?.isValid()) map.fitBounds(all, { padding: [40, 40] });
  }

  private drawArrows(r: RiderView): void {
    const pts = r.geometry;
    if (pts.length < 2) return;
    const total = pts.slice(1).reduce((s, p, i) => s + haversineKm(pts[i], p), 0);
    const spacing = Math.max(0.3, total / 10);
    let next = spacing / 2;
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = haversineKm(pts[i - 1], pts[i]);
      while (seg > 0 && walked + seg >= next) {
        const t = (next - walked) / seg;
        const lat = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
        const lng = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
        const angle = bearingDeg(pts[i - 1], pts[i]);
        L.marker([lat, lng], {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: 'route-arrow',
            html: `<svg width="16" height="16" viewBox="0 0 16 16" style="transform:rotate(${angle}deg)"><path d="M8 1 L14 14 L8 11 L2 14 Z" fill="#fff" stroke="${r.color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        }).addTo(this.layer);
        next += spacing;
      }
      walked += seg;
    }
  }
}
