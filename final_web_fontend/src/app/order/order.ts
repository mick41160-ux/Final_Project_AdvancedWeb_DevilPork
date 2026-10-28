import { ChangeDetectorRef, Component, inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, DeliveryOrder } from '../api.service';
@Component({
  imports: [FormsModule],
  selector: 'app-order',
  styleUrl: './order.css',
  templateUrl: './order.html',
})
export class Order implements OnDestroy {
  private refreshTimer?: ReturnType<typeof setInterval>;
  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  orders: DeliveryOrder[] = [];
  loading = true;
  error = '';
  actionError = '';
  searchTerm = '';
  riderId: number | null = null;
  private updatingOrderIds = new Set<number>();
  private riderStopSequences = new Map<number, number>();
  readonly statusLabels: Record<DeliveryOrder['status'], string> = {
    pending: 'รอดำเนินการ', ready: 'พร้อมจัดส่ง', assigned: 'มอบหมายแล้ว', delivered: 'ส่งสำเร็จแล้ว', cancelled: 'ยกเลิก',
  };
  readonly statuses: DeliveryOrder['status'][] = ['pending', 'ready', 'assigned', 'delivered', 'cancelled'];

  constructor() {
    const queryRiderId = Number(this.route.snapshot.queryParamMap.get('riderId'));
    const isRiderLogin = this.route.snapshot.queryParamMap.get('rider') === 'true';
    if (isRiderLogin && Number.isSafeInteger(queryRiderId) && queryRiderId > 0) {
      this.riderId = queryRiderId;
    }
    this.loadOrders();
    if (this.riderId !== null) {
      // ไรเดอร์: รีเฟรชแผนล่าสุดอัตโนมัติทุก 15 วินาที
      this.refreshTimer = setInterval(() => this.loadOrders(true), 15000);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.refreshTimer);
  }

  get filteredOrders(): DeliveryOrder[] {
    const term = this.searchTerm.trim().toLocaleLowerCase();
    return this.orders.filter((order) =>
      `#${order.id}`.toLocaleLowerCase().includes(term),
    );
  }

  getStopSequence(orderId: number): number | null {
    return this.riderStopSequences.get(orderId) ?? null;
  }

  loadOrders(silent = false): void {
    if (!silent) this.loading = true;
    if (this.riderId !== null) {
      this.loadRiderOrders(this.riderId);
      return;
    }
    this.api.getOrders().subscribe({
      next: (orders) => { this.riderStopSequences.clear(); this.orders = orders; this.loading = false; this.error = ''; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.error = 'โหลดข้อมูลออเดอร์ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ API'; this.cdr.markForCheck(); },
    });
  }

  private loadRiderOrders(riderId: number): void {
    this.api.getLatestRoutingPlan().subscribe({
      next: (plan) => {
        const route = plan.active_plan?.routes.find((item) => item.rider_id === riderId);
        this.riderStopSequences = new Map(
          (route?.stops ?? []).map((stop) => [stop.order_id, stop.stop_sequence]),
        );
        this.api.getOrders().subscribe({
          next: (orders) => {
            this.orders = orders
              .filter((order) => this.riderStopSequences.has(order.id))
              .sort((a, b) => (this.getStopSequence(a.id) ?? 0) - (this.getStopSequence(b.id) ?? 0));
            this.loading = false;
            this.error = '';
            this.cdr.markForCheck();
          },
          error: () => this.setLoadError(),
        });
      },
      error: () => this.setLoadError(),
    });
  }

  private setLoadError(): void {
    this.loading = false;
    this.error = 'Unable to load orders. Please check the API connection.';
    this.cdr.markForCheck();
  }

  isUpdating(orderId: number): boolean {
    return this.updatingOrderIds.has(orderId);
  }

  markDelivered(order: DeliveryOrder): void {
    if (this.riderId === null || order.status !== 'assigned' ||
        this.isUpdating(order.id) || !this.riderStopSequences.has(order.id)) return;

    this.actionError = '';
    this.updatingOrderIds.add(order.id);
    this.cdr.markForCheck();
    this.api.updateOrder(order.id, { status: 'delivered' }).subscribe({
      next: () => {
        order.status = 'delivered';
        this.updatingOrderIds.delete(order.id);
        this.cdr.markForCheck();
      },
      error: () => {
        this.updatingOrderIds.delete(order.id);
        this.actionError = 'บันทึกสถานะออเดอร์ #' + order.id + ' ไม่สำเร็จ กรุณาลองอีกครั้ง';
        this.cdr.markForCheck();
      },
    });
  }

  updateStatus(order: DeliveryOrder, status: DeliveryOrder['status']): void {
    if (this.riderId !== null) return;
    this.api.updateOrder(order.id, { status }).subscribe({
      next: () => { order.status = status; this.cdr.markForCheck(); },
      error: () => { this.error = `แก้ไขสถานะออเดอร์ #${order.id} ไม่สำเร็จ`; this.cdr.markForCheck(); },
    });
  }

  deleteOrder(order: DeliveryOrder): void {
    if (this.riderId !== null) return;
    if (!window.confirm(`ยืนยันลบออเดอร์ #${order.id} ใช่หรือไม่?`)) return;
    this.api.deleteOrder(order.id).subscribe({
      next: () => { this.orders = this.orders.filter((item) => item.id !== order.id); this.cdr.markForCheck(); },
      error: () => { this.error = `ลบออเดอร์ #${order.id} ไม่สำเร็จ`; this.cdr.markForCheck(); },
    });
  }

  openGoogleMaps(order: DeliveryOrder): void {
    const latitude = Number(order.latitude);
    const longitude = Number(order.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      this.error = 'This order does not have a valid delivery location.';
      this.cdr.markForCheck();
      return;
    }

    const depot = '16.2468,103.2514';
    const destination = `${latitude},${longitude}`;
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', depot);
    url.searchParams.set('destination', destination);
    url.searchParams.set('travelmode', 'driving');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }
}