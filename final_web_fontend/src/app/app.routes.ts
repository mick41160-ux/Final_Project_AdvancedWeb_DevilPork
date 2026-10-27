import { Routes } from '@angular/router';
import {StoreComponent} from './store/store';
import {RiderComponent} from './rider/rider';
import {Order} from './order/order';
import {Mgrider} from './mgrider/mgrider';
import {Porp} from './porp/porp';
import {Distace} from './distace/distace';

export const routes: Routes = [
  { path: '', redirectTo: 'store', pathMatch: 'full' },
  { path: 'store', component: StoreComponent },
  { path: 'rider', component: RiderComponent },
  { path: 'order', component: Order},
  { path: 'mgrider', component: Mgrider},
  { path: 'distace', component: Distace},
  { path: 'prop', component: Porp}
  
];
