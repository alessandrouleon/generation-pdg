import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PdfController } from './controllers/pdf.controller';
import { ChartService } from './service/chart.service';
import { MapService } from './service/map.service';
import { PdfGeneratorService } from './service/pdf-generator.service';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
  ],
  controllers: [ PdfController],
  providers: [ PdfGeneratorService, MapService, ChartService],
})
export class AppModule {}
