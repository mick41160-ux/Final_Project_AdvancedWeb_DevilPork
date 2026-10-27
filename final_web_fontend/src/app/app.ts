import { Component, signal } from '@angular/core';
import { Router,RouterOutlet } from '@angular/router';
import { Header } from './header/header';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('final_project');
  constructor(private readonly router: Router) {}

  isLoginPage(): boolean {
    return this.router.url.startsWith('/login');
  }

  isRiderOrderPage(): boolean {
    return this.router.url.startsWith('/order') && this.router.url.includes('rider=true');
  }
}
