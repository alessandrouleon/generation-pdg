import { Injectable } from '@nestjs/common';
import { chromium } from 'playwright';

interface DataPoint {
  geo: { lat: number; lng: number };
  temperature?: number;
  moisture?: number;
}

@Injectable()
export class MapService {
  private isValidPoint(p: any): p is DataPoint {
    return (
      p?.geo &&
      typeof p.geo.lat === 'number' &&
      typeof p.geo.lng === 'number' &&
      !isNaN(p.geo.lat) &&
      !isNaN(p.geo.lng)
    );
  }

  private buildMarkersJs(points: DataPoint[]): string {
    return points
      .map(
        (p, i) => `
          markers.push(
            L.marker([${p.geo.lat}, ${p.geo.lng}], { icon: customIcon })
              .addTo(map)
              .bindPopup("Ponto ${i + 1}<br>Temp: ${p.temperature ?? 'N/A'}°C<br>Umid: ${p.moisture ?? 'N/A'}%")
          );
        `
      )
      .join('\n');
  }
  

  private buildHtml(points: DataPoint[], markersJs: string): string {
    const centerLat = points.reduce((s, p) => s + p.geo.lat, 0) / points.length;
    const centerLng = points.reduce((s, p) => s + p.geo.lng, 0) / points.length;
  
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            body { margin: 0; }
            #map { width: 800px; height: 600px; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            let map = L.map('map').setView([${centerLat}, ${centerLng}], 8);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 18, attribution: '© OpenStreetMap'
            }).addTo(map);
  
            //Ícone sem sombra
            const customIcon = L.icon({
              iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowUrl: '' // remove a sombra
            });
  
            let markers = [];
            ${markersJs}
  
            if (${points.length} > 1) {
              map.fitBounds(new L.featureGroup(markers).getBounds().pad(0.1));
            }
          </script>
        </body>
      </html>`;
  }

  async generateMapImage(dataPoints: any[]): Promise<string> {
    const validPoints = dataPoints.filter(this.isValidPoint);
    if (!validPoints.length) throw new Error('Nenhum ponto válido');

    const html = this.buildHtml(validPoints, this.buildMarkersJs(validPoints));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.setContent(html, { waitUntil: 'networkidle' });

      const mapElement = await page.$('#map');
      if (!mapElement) throw new Error('Elemento do mapa não encontrado');

      const buffer = await mapElement.screenshot({ type: 'png' });
      return `data:image/png;base64,${buffer.toString('base64')}`;
    } finally {
      await browser.close();
    }
  }
}
