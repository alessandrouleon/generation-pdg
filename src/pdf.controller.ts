import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PdfGeneratorService } from './pdf-generator.service';

@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfGeneratorService) {}

  @Get()
  async getPdf(@Res() res: Response) {
    const pdf = await this.pdfService.generatePdf();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="relatorio.pdf"',
    });
    res.send(pdf);
  }
}
