import { Component } from '@angular/core';
import {RouterLink} from '@angular/router';
@Component({
  imports: [RouterLink],
  selector: 'app-order',
  styleUrl: './order.css',
  templateUrl: './order.html',
})
export class Order {
  editOrder(event: Event) {
    event.preventDefault();
    console.log('Edit order:');
  }
  deleteOrder(event: Event) {
    event.preventDefault();
    console.log('Delete order:');
  }
}
