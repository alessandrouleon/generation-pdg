import { Injectable } from '@nestjs/common';
import { chromium } from 'playwright';
import { dataPoints } from './dataPoints';

@Injectable()
export class PdfGeneratorService {
  async generatePdf(): Promise<Buffer> {

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
            <td>${point.vibration}g</td>
            <td>${point.moisture}%</td>
          </tr>
        `;
      })
      .join('');

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
      </style>
    </head>
    <body>
      <h2>Relatório de Dados</h2>
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
