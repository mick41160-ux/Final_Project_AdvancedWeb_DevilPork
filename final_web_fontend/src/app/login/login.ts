import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

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
  orderNumber = '';
  showPassword = false;
  submitted = false;

  constructor(private readonly router: Router) {}

  selectRole(role: 'store' | 'rider'): void {
    this.selectedRole = role;
    this.submitted = false;
  }

  login(): void {
    this.submitted = true;
    const storeCredentialsComplete = this.email && this.password;
    const riderCredentialsComplete = this.orderNumber;

    if ((this.selectedRole === 'store' && storeCredentialsComplete) ||
        (this.selectedRole === 'rider' && riderCredentialsComplete)) {
      if (this.selectedRole === 'rider') {
        this.router.navigate(['/order'], { queryParams: { rider: true, order: this.orderNumber.trim() } });
        return;
      }
      this.router.navigate(['/store']);
    }
  }
}
