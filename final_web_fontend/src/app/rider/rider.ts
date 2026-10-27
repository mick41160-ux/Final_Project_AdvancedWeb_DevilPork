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

  constructor() { this.loadCustomers(); }

  get filteredCustomers(): Customer[] {
    const term = this.searchTerm.trim().toLocaleLowerCase();
    return this.customers.filter((customer) =>
      `${customer.id} ${customer.first_name} ${customer.last_name} ${customer.phone}`.toLocaleLowerCase().includes(term),
    );
  }

  loadCustomers(): void {
    this.loading = true;
    this.api.getCustomers().subscribe({
      next: (customers) => { this.customers = customers; this.loading = false; this.error = ''; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.error = 'โหลดข้อมูลลูกค้าไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ API'; this.cdr.markForCheck(); },
    });
  }
}
