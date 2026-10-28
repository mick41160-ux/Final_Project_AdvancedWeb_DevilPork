import { Routes } from '@angular/router';
import {StoreComponent} from './store/store';
import {RiderComponent} from './rider/rider';
import {Order} from './order/order';
import {Mgrider} from './mgrider/mgrider';
import {Distace} from './distace/distace';
import {Login} from './login/login';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'store', component: StoreComponent },
  { path: 'rider', component: RiderComponent },
  { path: 'order', component: Order},
  { path: 'mgrider', component: Mgrider},
  { path: 'distace', component: Distace},
  
];



