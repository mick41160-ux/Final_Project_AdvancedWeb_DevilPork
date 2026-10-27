import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Rider } from '../api.service';
@Component({
  imports: [FormsModule],
  selector: 'app-mgrider',
  styleUrl: './mgrider.css',
  templateUrl: './mgrider.html',
})
export class Mgrider {
  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  riders: Rider[] = [];
  loading = true;
  error = '';
  searchTerm = '';

  constructor() {
    this.api.getRiders().subscribe({
      next: (riders) => { this.riders = riders; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.error = 'โหลดข้อมูลไรเดอร์ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ API'; this.loading = false; this.cdr.markForCheck(); },
    });
  }

  get filteredRiders(): Rider[] {
    const term = this.searchTerm.trim().toLocaleLowerCase();
    return this.riders.filter((rider) => `${rider.id} ${rider.display_name} ${rider.phone}`.toLocaleLowerCase().includes(term));
  }

  isAvailable(rider: Rider): boolean { return rider.is_available === true || rider.is_available === 1; }
}
