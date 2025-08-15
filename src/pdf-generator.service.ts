import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import { chromium, Page } from 'playwright';

interface PdfData {
  images: string[]; // Base64 ou caminhos dos arquivos
  csvData: any[];
  charts: ChartConfig[];
  mapConfig: MapConfig;
  title: string;
  metadata?: any;
}

interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  data: any;
  title: string;
}

interface MapConfig {
  center: [number, number];
  zoom: number;
  markers?: Array<{ lat: number; lng: number; title: string }>;
}

@Injectable()
export class PdfGeneratorService {
  async generateCompletePdf(data: PdfData): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    let page: Page | undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const context = await browser.newContext();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      page = await context.newPage();

      // Viewport ajuda a renderização do canvas/leaflet
      await page.setViewportSize({ width: 1280, height: 900 });

      // Corrige imagens que são caminhos de arquivo
      const normalizedImages = await this.normalizeImages(data.images || []);
      const htmlContent = this.buildCompleteHtml({
        ...data,
        images: normalizedImages,
      });

      // Evita travar por causa de tiles do Leaflet
      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Aguarda charts e mapa (se existirem)
      await page.waitForFunction(
        () =>
          (window as any).chartRenderComplete === true &&
          (window as any).mapRenderComplete === true,
        { timeout: 60000 },
      );

      await page.emulateMedia({ media: 'print' });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
        displayHeaderFooter: true,
        headerTemplate:
          '<div style="font-size:10px;width:100%;text-align:center;">Relatório Completo</div>',
        footerTemplate:
          '<div style="font-size:10px;width:100%;text-align:center;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
      });

      return pdf;
    } finally {
      try {
        await page?.close();
      } catch {}
      await browser.close();
    }
  }

  private async normalizeImages(images: string[]): Promise<string[]> {
    const toDataUri = async (src: string): Promise<string> => {
      // já é data URI
      if (src.startsWith('data:')) return src;

      // pode ser base64 "pura" (heurística simples)
      if (/^[A-Za-z0-9+/=]+$/.test(src) && src.length > 100) {
        return `data:image/png;base64,${src}`;
      }

      // considera caminho de arquivo
      try {
        const buf = await fs.promises.readFile(src);
        const mime = this.mimeFromExt(src);
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        // se falhar, devolve como veio (para você depurar a origem)
        return src;
      }
    };

    return Promise.all(images.map(toDataUri));
  }

  private mimeFromExt(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'webp') return 'image/webp';
    return 'image/png';
  }

  private buildCompleteHtml(data: PdfData): string {
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${data.title}</title>
        <style>${this.getCssStyles()}</style>

        <!-- External Libraries -->
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${data.title}</h1>
            <p class="subtitle">Relatório gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
          </div>

          ${this.renderImagesSection(data.images)}
          ${this.renderChartsSection(data.charts)}
          ${this.renderMapSection(data.mapConfig)}
          ${this.renderCsvTableSection(data.csvData)}
        </div>

        <script>
          ${this.getJavaScriptCode(data)}
        </script>
      </body>
      </html>
    `;
  }

  private getCssStyles(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #fff; }
      .container { max-width: 100%; margin: 0 auto; padding: 20px; }
      .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #007bff; padding-bottom: 20px; }
      .header h1 { color: #007bff; font-size: 2.2em; margin-bottom: 10px; }
      .subtitle { color: #666; font-size: 1.1em; }
      .section { margin-bottom: 40px; page-break-inside: avoid; }
      .section-title { font-size: 1.4em; color: #007bff; margin-bottom: 16px; border-left: 4px solid #007bff; padding-left: 12px; }
      .images-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
      .image-container { text-align: center; border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #f9f9f9; }
      .image-container img { max-width: 100%; height: auto; border-radius: 4px; }
      .chart-container { margin-bottom: 24px; text-align: center; }
      .chart-wrapper { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
      .chart-title { font-size: 1.1em; margin-bottom: 12px; color: #333; }
      .chart-canvas { width: 100% !important; height: 380px !important; }
      .map-wrapper { width: 100%; height: 380px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
      .table-container { margin-bottom: 24px; }
      .data-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.9em; }
      .data-table th, .data-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      .data-table th { background-color: #007bff; color: #fff; font-weight: 600; }
      .data-table tr:nth-child(even) { background-color: #f9f9f9; }
      .pagination-info { text-align: center; margin-top: 10px; color: #666; }
      @media print {
        .section { page-break-inside: avoid; }
        .table-container, .data-table { page-break-inside: auto; }
        .data-table tr { page-break-inside: avoid; }
      }
    `;
  }

  private renderImagesSection(images: string[]): string {
    if (!images || images.length === 0) return '';
    const imageElements = images
      .map(
        (image, index) => `
      <div class="image-container">
        <img src="${image}" alt="Imagem ${index + 1}" />
        <p>Imagem ${index + 1}</p>
      </div>
    `,
      )
      .join('');
    return `
      <div class="section">
        <h2 class="section-title">📸 Imagens</h2>
        <div class="images-grid">${imageElements}</div>
      </div>
    `;
  }

  private renderChartsSection(charts: ChartConfig[]): string {
    if (!charts || charts.length === 0) return '';
    const chartEls = charts
      .map(
        (chart, index) => `
      <div class="chart-container">
        <div class="chart-wrapper">
          <h3 class="chart-title">${chart.title}</h3>
          <canvas id="chart-${index}" class="chart-canvas"></canvas>
        </div>
      </div>
    `,
      )
      .join('');
    return `<div class="section"><h2 class="section-title">📊 Gráficos</h2>${chartEls}</div>`;
  }

  private renderMapSection(mapConfig: MapConfig): string {
    if (!mapConfig) return '';
    return `
      <div class="section">
        <h2 class="section-title">🗺️ Mapa</h2>
        <div class="map-wrapper"><div id="map" style="width:100%;height:100%;"></div></div>
      </div>
    `;
  }

  private renderCsvTableSection(csvData: any[]): string {
    if (!csvData || csvData.length === 0) return '';
    const headers = Object.keys(csvData[0]);
    const maxRows = 1000;
    const totalPages = Math.ceil(csvData.length / maxRows);
    const currentPageData = csvData.slice(0, maxRows);

    const headerRow = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    const dataRows = currentPageData
      .map(
        (row) =>
          `<tr>${headers.map((h) => `<td>${row[h] ?? ''}</td>`).join('')}</tr>`,
      )
      .join('');

    const info =
      csvData.length > maxRows
        ? `<div class="pagination-info">Mostrando ${maxRows} de ${csvData.length} registros (Página 1 de ${totalPages})</div>`
        : `<div class="pagination-info">Total: ${csvData.length} registros</div>`;

    return `
      <div class="section">
        <h2 class="section-title">📋 Dados da Planilha</h2>
        <div class="table-container">
          <table class="data-table">
            <thead>${headerRow}</thead>
            <tbody>${dataRows}</tbody>
          </table>
          ${info}
        </div>
      </div>
    `;
  }

  private getJavaScriptCode(data: PdfData): string {
    const hasCharts = !!(data.charts && data.charts.length);
    const hasMap = !!data.mapConfig;
    return `
      // Flags globais para o Playwright esperar
      window.chartRenderComplete = ${hasCharts ? 'false' : 'true'};
      window.mapRenderComplete = ${hasMap ? 'false' : 'true'};
      window.__chartsToRender = ${hasCharts ? data.charts.length : 0};
      window.__chartsRendered = 0;
      window.__markChartReady = function () {
        window.__chartsRendered++;
        if (window.__chartsRendered >= window.__chartsToRender) {
          window.chartRenderComplete = true;
        }
      };

      ${this.generateChartsScript(data.charts)}
      ${this.generateMapScript(data.mapConfig)}
    `;
  }

  private generateChartsScript(charts: ChartConfig[]): string {
    if (!charts || charts.length === 0) return '';
    return charts
      .map(
        (chart, index) => `
      (function(){
        const el = document.getElementById('chart-${index}');
        if (!el) { window.__markChartReady(); return; }
        new Chart(el, {
          type: '${chart.type}',
          data: ${JSON.stringify(chart.data)},
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { onComplete: () => window.__markChartReady() },
            plugins: {
              title: { display: true, text: ${JSON.stringify(chart.title)} },
              legend: { position: 'top' }
            },
            scales: ${chart.type !== 'pie' && chart.type !== 'doughnut' ? `{ y: { beginAtZero: true } }` : '{}'}
          }
        });
        // fallback (se animação estiver desativada)
        setTimeout(() => window.__markChartReady(), 1000);
      })();
    `,
      )
      .join('\n');
  }

  private generateMapScript(mapConfig: MapConfig): string {
    if (!mapConfig) return '';
    return `
      (function(){
        const map = L.map('map').setView([${mapConfig.center[0]}, ${mapConfig.center[1]}], ${mapConfig.zoom});
        const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' });
        tiles.on('load', function(){ window.mapRenderComplete = true; });
        tiles.addTo(map);
        ${(mapConfig.markers || [])
          .map(
            (m) =>
              `L.marker([${m.lat}, ${m.lng}]).addTo(map).bindPopup(${JSON.stringify(m.title)});`,
          )
          .join('\n')}
        setTimeout(() => { map.invalidateSize(); }, 500);
        // fallback: se offline, não bloqueia a geração
        setTimeout(() => { if (!window.mapRenderComplete) window.mapRenderComplete = true; }, 3000);
      })();
    `;
  }

  // Método auxiliar para converter arquivo para base64
  private async fileToBase64(filePath: string): Promise<string> {
    try {
      const fileBuffer = await fs.promises.readFile(filePath);
      return fileBuffer.toString('base64');
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error('Erro ao converter arquivo para base64:', err.message);
      } else {
        console.error('Erro ao converter arquivo para base64:', err);
      }
      return '';
    }
  }

  // Método para processar CSV (simples)
  private processCsvData(csvString: string): any[] {
    const lines = csvString.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(',');
      const obj: Record<string, string> = {};
      headers.forEach((header, index) => {
        obj[header] = values[index]?.trim() ?? '';
      });
      return obj;
    });
  }
}
