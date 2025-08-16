import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { PdfController } from './pdf.controller';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
  ],
  controllers: [AppController, PdfController],
  providers: [AppService, PdfGeneratorService],
})
export class AppModule {}
