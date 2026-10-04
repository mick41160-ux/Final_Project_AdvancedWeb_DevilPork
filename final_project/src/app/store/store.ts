import { Component, inject } from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {Router,RouterLink} from '@angular/router';
@Component({
  imports: [RouterOutlet,RouterLink],
  selector: 'app-store',
  styleUrl: './store.css',
  templateUrl: './store.html',
})
export class  StoreComponent{
}