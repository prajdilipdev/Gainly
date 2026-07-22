import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser('sub') userId: string) {
    return this.analyticsService.getDashboard(userId);
  }

  @Get('portfolios/:portfolioId/summary')
  getSummary(
    @CurrentUser('sub') userId: string,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
  ) {
    return this.analyticsService.getPortfolioSummary(userId, portfolioId);
  }
}
