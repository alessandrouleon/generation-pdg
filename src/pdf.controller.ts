import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { PdfGeneratorService } from './pdf-generator.service';

@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfGeneratorService: PdfGeneratorService) {}

  @Post('generate-complete')
  @UseInterceptors(FilesInterceptor('files'))
  async generateCompletePdf(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @Res() res: Response,
  ) {
    try {
      // Processar imagens enviadas
      const images = await this.processUploadedImages(files);

      // Dados de exemplo para o PDF
      const pdfData = {
        title: body.title || 'Relatório Completo',
        images: images,
        csvData: body.csvData || this.getSampleCsvData(),
        charts: body.charts || this.getSampleCharts(),
        mapConfig: body.mapConfig || this.getSampleMapConfig(),
        metadata: body.metadata || {},
      };

      // Gerar PDF
      const pdfBuffer =
        await this.pdfGeneratorService.generateCompletePdf(pdfData);

      // Retornar PDF
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorio-completo-${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.end(pdfBuffer);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message,
      });
    }
  }

  @Post('generate-from-csv')
  @UseInterceptors(FilesInterceptor('files'))
  async generateFromCsv(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @Res() res: Response,
  ) {
    try {
      // Encontrar arquivo CSV
      const csvFile = files.find(
        (file) =>
          file.mimetype === 'text/csv' || file.originalname.endsWith('.csv'),
      );

      if (!csvFile) {
        return res.status(400).json({ error: 'Arquivo CSV não encontrado' });
      }

      // Processar CSV
      const csvString = csvFile.buffer.toString('utf-8');
      const csvData = this.processCsvString(csvString);

      // Processar outras imagens
      const imageFiles = files.filter(
        (file) =>
          file.mimetype.startsWith('image/') &&
          ['png', 'jpg', 'jpeg', 'svg'].some((ext) =>
            file.originalname.toLowerCase().endsWith(ext),
          ),
      );

      const images = await this.processImageFiles(imageFiles);

      const pdfData = {
        title: `Relatório CSV - ${csvFile.originalname}`,
        images: images,
        csvData: csvData,
        charts: this.generateChartsFromCsv(csvData),
        mapConfig: body.mapConfig || this.getSampleMapConfig(),
      };

      const pdfBuffer =
        await this.pdfGeneratorService.generateCompletePdf(pdfData);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorio-csv-${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.end(pdfBuffer);
    } catch (error) {
      console.error('Erro ao processar CSV:', error);
      res.status(500).json({
        error: 'Erro ao processar arquivo CSV',
        message: error.message,
      });
    }
  }

  // Método para grandes volumes de dados (processamento assíncrono)
  @Post('generate-large-dataset')
  async generateLargeDataset(@Body() body: any) {
    try {
      // Para datasets muito grandes, usar processamento assíncrono
      const jobId = `pdf-job-${Date.now()}`;

      // Processar em background (você pode usar Bull Queue aqui)
      this.processLargeDatasetAsync(jobId, body);

      return {
        jobId: jobId,
        status: 'processing',
        message: 'PDF está sendo gerado. Use o jobId para verificar o status.',
      };
    } catch (error) {
      throw new Error(`Erro ao iniciar processamento: ${error.message}`);
    }
  }

  @Get('status/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    // Verificar status do job (implementar com Redis ou banco)
    return {
      jobId: jobId,
      status: 'completed', // ou 'processing', 'failed'
      progress: 100,
      downloadUrl: `/pdf/download/${jobId}`,
    };
  }

  @Get('download/:jobId')
  async downloadPdf(@Param('jobId') jobId: string, @Res() res: Response) {
    // Buscar PDF gerado (implementar storage)
    const pdfPath = `./generated-pdfs/${jobId}.pdf`;

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ error: 'PDF não encontrado' });
    }

    const pdfBuffer = fs.readFileSync(pdfPath);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio-${jobId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  // Métodos auxiliares
  private async processUploadedImages(
    files: Express.Multer.File[],
  ): Promise<string[]> {
    const imageFiles =
      files?.filter(
        (file) =>
          file.mimetype.startsWith('image/') &&
          ['png', 'jpg', 'jpeg', 'svg'].some((ext) =>
            file.originalname.toLowerCase().endsWith(ext),
          ),
      ) || [];

    return imageFiles.map((file) => {
      const base64 = file.buffer.toString('base64');
      return `data:${file.mimetype};base64,${base64}`;
    });
  }

  private async processImageFiles(
    files: Express.Multer.File[],
  ): Promise<string[]> {
    return files.map((file) => {
      const base64 = file.buffer.toString('base64');
      return `data:${file.mimetype};base64,${base64}`;
    });
  }

  private processCsvString(csvString: string): any[] {
    const lines = csvString.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      return obj;
    });
  }

  private generateChartsFromCsv(csvData: any[]): any[] {
    if (!csvData || csvData.length === 0) return [];

    const headers = Object.keys(csvData[0]);
    const numericHeaders = headers.filter((header) =>
      csvData.some((row) => !isNaN(parseFloat(row[header]))),
    );

    if (numericHeaders.length < 2) return [];

    // Gráfico de barras com primeiras 10 linhas
    const chartData = {
      labels: csvData.slice(0, 10).map((row, index) => `Item ${index + 1}`),
      datasets: [
        {
          label: numericHeaders[0],
          data: csvData
            .slice(0, 10)
            .map((row) => parseFloat(row[numericHeaders[0]]) || 0),
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
        },
      ],
    };

    return [
      {
        type: 'bar' as const,
        title: `Análise de ${numericHeaders[0]}`,
        data: chartData,
      },
    ];
  }

  private getSampleCsvData(): any[] {
    return [
      { nome: 'João', idade: 25, salario: 5000, cidade: 'São Paulo' },
      { nome: 'Maria', idade: 30, salario: 6000, cidade: 'Rio de Janeiro' },
      { nome: 'Pedro', idade: 35, salario: 7000, cidade: 'Belo Horizonte' },
      { nome: 'Ana', idade: 28, salario: 5500, cidade: 'Brasília' },
      { nome: 'Carlos', idade: 32, salario: 6500, cidade: 'Salvador' },
    ];
  }

  private getSampleCharts(): any[] {
    return [
      {
        type: 'bar' as const,
        title: 'Vendas por Mês',
        data: {
          labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
          datasets: [
            {
              label: 'Vendas 2024',
              data: [12000, 15000, 18000, 14000, 16000, 19000],
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1,
            },
          ],
        },
      },
      {
        type: 'pie' as const,
        title: 'Distribuição por Região',
        data: {
          labels: ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'],
          datasets: [
            {
              data: [10, 25, 15, 35, 15],
              backgroundColor: [
                '#FF6384',
                '#36A2EB',
                '#FFCE56',
                '#4BC0C0',
                '#9966FF',
              ],
            },
          ],
        },
      },
    ];
  }

  private getSampleMapConfig(): any {
    return {
      center: [-14.235, -51.9253], // Centro do Brasil
      zoom: 4,
      markers: [
        { lat: -23.5505, lng: -46.6333, title: 'São Paulo' },
        { lat: -22.9068, lng: -43.1729, title: 'Rio de Janeiro' },
        { lat: -19.9191, lng: -43.9386, title: 'Belo Horizonte' },
        { lat: -15.8267, lng: -47.9218, title: 'Brasília' },
      ],
    };
  }

  private async processLargeDatasetAsync(jobId: string, data: any) {
    // Implementar processamento assíncrono aqui
    // Usar Bull Queue ou similar para processar em background
    console.log(`Processando job ${jobId}...`);

    setTimeout(async () => {
      try {
        const pdfBuffer =
          await this.pdfGeneratorService.generateCompletePdf(data);

        // Salvar PDF no storage
        const pdfPath = `./generated-pdfs/${jobId}.pdf`;
        fs.writeFileSync(pdfPath, pdfBuffer);

        console.log(`Job ${jobId} concluído!`);
      } catch (error) {
        console.error(`Erro no job ${jobId}:`, error);
      }
    }, 5000); // Simular processamento
  }
}
