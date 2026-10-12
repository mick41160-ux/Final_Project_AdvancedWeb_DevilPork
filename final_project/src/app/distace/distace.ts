import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import {RouterLink} from '@angular/router';
import * as L from 'leaflet';

@Component({
  imports: [RouterLink],
  selector: 'app-distace',
  styleUrl: './distace.css',
  templateUrl: './distace.html',
})
export class Distace implements AfterViewInit, OnDestroy {
  private map?: L.Map;

  ngAfterViewInit(): void {
    const map = L.map('routeMap', { zoomControl: true }).setView([16.2468, 103.2514], 14);
    this.map = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const depot: L.LatLngExpression = [16.2468, 103.2514];
    const deliveryStops: L.LatLngExpression[] = [
      [16.2531, 103.2482],
      [16.2504, 103.2639],
      [16.2411, 103.2593],
    ];

    const depotIcon = L.divIcon({
      className: 'route-marker route-marker--depot',
      html: '<span>ครัว</span>',
      iconSize: [42, 28],
      iconAnchor: [21, 14],
    });
    const stopIcon = (number: number) => L.divIcon({
      className: 'route-marker route-marker--stop',
      html: `<span>${number}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker(depot, { icon: depotIcon }).addTo(map).bindPopup('จุดเริ่มต้น: ครัว');
    deliveryStops.forEach((stop, index) => {
      L.marker(stop, { icon: stopIcon(index + 1) })
        .addTo(map)
        .bindPopup(`จุดส่งที่ ${index + 1}`);
    });

    L.polyline([depot, ...deliveryStops], {
      color: '#2563eb',
      weight: 5,
      opacity: 0.8,
    }).addTo(map);

    map.fitBounds(L.latLngBounds([depot, ...deliveryStops]), { padding: [32, 32] });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
