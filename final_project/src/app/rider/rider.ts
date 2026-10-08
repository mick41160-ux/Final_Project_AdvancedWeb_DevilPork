import { Component } from '@angular/core';
import {RouterLink} from '@angular/router';
import { Order } from '../order/order';

@Component({
  imports: [RouterLink,Order],
  selector: 'app-rider',
  styleUrl: './rider.css',
  templateUrl: './rider.html',
})
export class  RiderComponent{ 
  editOrder(event: Event) {
    event.preventDefault();
    console.log('Edit order:');
  }
  deleteOrder(event: Event) {
    event.preventDefault();
    console.log('Delete order:');
  }
}
