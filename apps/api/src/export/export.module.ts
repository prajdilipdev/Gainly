import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { PortfoliosModule } from '../portfolios/portfolios.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [PortfoliosModule, AnalyticsModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
