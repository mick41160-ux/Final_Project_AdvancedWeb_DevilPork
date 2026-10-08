import { Component } from '@angular/core';
import {RouterLink} from '@angular/router';
@Component({
  imports: [RouterLink],
  selector: 'app-mgrider',
  styleUrl: './mgrider.css',
  templateUrl: './mgrider.html',
})
export class Mgrider {
  editOrder(event: Event) {
    event.preventDefault();
    console.log('Edit order:');
  }
  deleteOrder(event: Event) {
    event.preventDefault();
    console.log('Delete order:');
  }
}
