import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, Customer } from '../api.service';

@Component({
  imports: [RouterLink, FormsModule],
  selector: 'app-rider',
  styleUrl: './rider.css',
  templateUrl: './rider.html',
})
export class RiderComponent {
  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  customers: Customer[] = [];
  loading = true;
  error = '';
  searchTerm = '';
  editingCustomer: Customer | null = null;

  constructor() { this.loadCustomers(); }

  get filteredCustomers(): Customer[] {
    const term = this.searchTerm.trim().toLocaleLowerCase();
    return this.customers.filter((customer) =>
      `${customer.id}`.toLocaleLowerCase().includes(term),
    );
  }

  loadCustomers(): void {
    this.loading = true;
    this.api.getCustomers().subscribe({
      next: (customers) => { this.customers = customers; this.loading = false; this.error = ''; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.error = 'โหลดข้อมูลลูกค้าไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ API'; this.cdr.markForCheck(); },
    });
  }

  startEdit(customer: Customer): void {
    this.editingCustomer = { ...customer };
    this.error = '';
  }

  cancelEdit(): void {
    this.editingCustomer = null;
  }

  saveCustomer(): void {
    const customer = this.editingCustomer;
    if (!customer) return;

    const { id, ...update } = customer;
    this.api.updateCustomer(id, update).subscribe({
      next: () => {
        const index = this.customers.findIndex((item) => item.id === id);
        if (index !== -1) this.customers[index] = { ...customer };
        this.editingCustomer = null;
        this.error = '';
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'แก้ไขข้อมูลลูกค้าไม่สำเร็จ';
        this.cdr.markForCheck();
      },
    });
  }

  deleteCustomer(customer: Customer): void {
    if (!window.confirm(`ยืนยันการลบลูกค้า ${customer.first_name} ${customer.last_name} ใช่หรือไม่?`)) return;

    this.api.deleteCustomer(customer.id).subscribe({
      next: () => {
        this.customers = this.customers.filter((item) => item.id !== customer.id);
        if (this.editingCustomer?.id === customer.id) this.editingCustomer = null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'ลบข้อมูลลูกค้าไม่สำเร็จ';
        this.cdr.markForCheck();
      },
    });
  }
}
