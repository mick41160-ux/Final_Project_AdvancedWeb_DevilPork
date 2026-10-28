import { Component, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';

@Component({
  imports: [FormsModule],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  selectedRole: 'store' | 'rider' = 'store';
  email = '';
  password = '';
  riderId = '';
  showPassword = false;
  submitted = false;
  riderError = '';

  private readonly api = inject(ApiService);
  constructor(private readonly router: Router) {}

  selectRole(role: 'store' | 'rider'): void {
    this.selectedRole = role;
    this.submitted = false;
    this.riderError = '';
  }

  login(form: NgForm): void {
    this.submitted = true;
    if (form.invalid) return;

    if (this.selectedRole === 'store') {
      this.router.navigate(['/store']);
      return;
    }

    const riderId = Number(this.riderId);
    if (!Number.isSafeInteger(riderId) || riderId < 1) {
      this.riderError = 'กรุณากรอกรหัสไรเดอร์เป็นตัวเลข';
      return;
    }
    this.riderError = '';
    this.api.getRiders().subscribe({
      next: (riders) => {
        if (!riders.some((rider) => rider.id === riderId)) {
          this.riderError = 'ไม่พบรหัสไรเดอร์นี้';
          return;
        }
        this.router.navigate(['/order'], { queryParams: { rider: true, riderId } });
      },
      error: () => this.riderError = 'ตรวจสอบรหัสไรเดอร์ไม่สำเร็จ',
    });
  }
}
