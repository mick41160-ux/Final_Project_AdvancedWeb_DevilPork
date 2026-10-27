import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, DeliveryOrder, Rider } from '../api.service';
@Component({
  imports: [RouterLink],
  selector: 'app-store',
  styleUrl: './store.css',
  templateUrl: './store.html',
})
export class  StoreComponent{
  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  orders: DeliveryOrder[] = [];
  riders: Rider[] = [];
  loading = true;
  error = '';

  constructor() {
    this.api.getOrders().subscribe({
      next: (orders) => { this.orders = orders; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.error = 'โหลดข้อมูลภาพรวมไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ API'; this.loading = false; this.cdr.markForCheck(); },
    });
    this.api.getRiders().subscribe({ next: (riders) => { this.riders = riders; this.cdr.markForCheck(); } });
  }

  get totalBoxes(): number { return this.orders.reduce((sum, order) => sum + Number(order.box_count), 0); }
  get readyRiders(): Rider[] { return this.riders.filter((rider) => rider.is_available === true || rider.is_available === 1); }
  countStatus(status: DeliveryOrder['status']): number { return this.orders.filter((order) => order.status === status).length; }
  customerName(order: DeliveryOrder): string { return `${order.first_name} ${order.last_name}`; }
}
