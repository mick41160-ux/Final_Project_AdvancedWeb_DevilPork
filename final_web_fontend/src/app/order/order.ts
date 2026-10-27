import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, DeliveryOrder } from '../api.service';
@Component({
  imports: [FormsModule],
  selector: 'app-order',
  styleUrl: './order.css',
  templateUrl: './order.html',
})
export class Order {
  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  orders: DeliveryOrder[] = [];
  loading = true;
  error = '';
  searchTerm = '';
  readonly statusLabels: Record<DeliveryOrder['status'], string> = {
    pending: 'รอดำเนินการ', ready: 'พร้อมจัดส่ง', assigned: 'มอบหมายแล้ว', delivered: 'ส่งสำเร็จ', cancelled: 'ยกเลิก',
  };
  readonly statuses: DeliveryOrder['status'][] = ['pending', 'ready', 'assigned', 'delivered', 'cancelled'];

  constructor() { this.loadOrders(); }

  get filteredOrders(): DeliveryOrder[] {
    const term = this.searchTerm.trim().toLocaleLowerCase();
    return this.orders.filter((order) =>
      `#${order.id} ${order.first_name} ${order.last_name} ${order.phone} ${order.status}`.toLocaleLowerCase().includes(term),
    );
  }

  loadOrders(): void {
    this.loading = true;
    this.api.getOrders().subscribe({
      next: (orders) => { this.orders = orders; this.loading = false; this.error = ''; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.error = 'โหลดข้อมูลออเดอร์ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ API'; this.cdr.markForCheck(); },
    });
  }

  updateStatus(order: DeliveryOrder, status: DeliveryOrder['status']): void {
    this.api.updateOrder(order.id, { status }).subscribe({
      next: () => { order.status = status; this.cdr.markForCheck(); },
      error: () => { this.error = `แก้ไขสถานะออเดอร์ #${order.id} ไม่สำเร็จ`; this.cdr.markForCheck(); },
    });
  }

  deleteOrder(order: DeliveryOrder): void {
    if (!window.confirm(`ยืนยันลบออเดอร์ #${order.id} ใช่หรือไม่?`)) return;
    this.api.deleteOrder(order.id).subscribe({
      next: () => { this.orders = this.orders.filter((item) => item.id !== order.id); this.cdr.markForCheck(); },
      error: () => { this.error = `ลบออเดอร์ #${order.id} ไม่สำเร็จ`; this.cdr.markForCheck(); },
    });
  }
}
