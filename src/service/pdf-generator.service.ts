import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { dataPoints } from '../dataPoints';
import { datapointData } from '../datapointData';
import { ChartService } from './chart.service';
import { MapService } from './map.service';

@Injectable()
export class PdfGeneratorService {

  constructor(
    private readonly mapService: MapService,
    private readonly chartService: ChartService
  ) {}

  async generatePdf(): Promise<Buffer> {

    // Caminho absoluto do logo
    const logoPath = path.join(process.cwd(), 'src/assets/pharmalog-logo.svg');
    const logoBase64 = fs.readFileSync(logoPath, { encoding: 'base64' });
    const logoDataUrl = `data:image/svg+xml;base64,${logoBase64}`;

    const dataPointData = datapointData;

    // Constrói as linhas da tabela dinamicamente
    const tableRows = dataPoints.data
      .map((point: any) => {
        const date = new Date(point.timestamp);
        const formattedDate = date.toLocaleString('pt-BR', {
          timeZone: 'America/Manaus',
        });

        return `
          <tr>
            <td>${formattedDate}</td>
            <td>${point.temperature}°C</td>
            <td>${point.vibration ?? 0}g</td>
            <td>${point.moisture}%</td>
          </tr>
        `;
      })
      .join('');

    // Gera imagem do mapa
    const chartImageBase64 = await this.chartService.generateChartImage(dataPoints.data);
    const mapImageBase64 = await this.mapService.generateMapImage(dataPoints.data);

    const htmlContent = `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        thead { display: table-row-group; } /* evita repetição em cada página */
        /* CSS específico para o header */
        .header-container {
          background-color: white;
          padding: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          max-width: 1200px;
          height: 100px;
          margin: 0 auto;
        }

        .logo-section {
          flex: 0 0 200px;
        }

        .logo-section img {
          width: 100%;
          max-width: 100px;
          height: auto;
          border: none;
        }

        .info-section {
          flex: 1;
          text-align: right;
          color: #666;
          font-size: 14px;
          line-height: 1.6;
        }

        .info-section div {
          margin-bottom: 5px;
        }

        .info-section strong {
          color: #333;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
     <!-- Header inicial -->
     <div class="header-container">
       <div class="header-content">
         <div class="logo-section">
           <img src="${logoDataUrl}" alt="Pharmalog Logo"/>
         </div>
         <div class="info-section">
           <div><strong>Data de relatório:</strong> 17/08/2025 17:28</div>
           <div><strong>Usuário:</strong> Pharmalog Admin</div>
           <div><strong>Relatório:</strong> Detalhamento de datalogger por carga</div>
         </div>
       </div>
     </div>
   


    <h3 style="color:#123f6e;">1. Gráfico de Leitura Interna</h3>
          <img src="${chartImageBase64}" style="width:100%; max-width:800px; max-height:650px; border:1px solid #ccc;"/>
    
      <h3  style="color:#123f6e;">Mapa</h3>
      <img src="${mapImageBase64}" style="width:100%; max-width:800px; border:1px solid #ccc;"/>
      <h2  style="color:#123f6e; margin-top: 20px;">Relatório de Dados</h2>
      <table>
        <thead>
          <tr>
            <th>Data Hora</th>
            <th>Temp. Int (°C)</th>
            <th>Vibração (g)</th>
            <th>Umid. Int (%)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </body>
  </html>
`;

    // Lança o navegador headless
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    });

    await browser.close();

    return pdfBuffer;
  }
}
