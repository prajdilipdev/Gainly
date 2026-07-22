import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const FORMATS = ['csv', 'xlsx', 'pdf', 'json'] as const;
const SCOPES = ['transactions', 'holdings'] as const;

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('portfolios/:portfolioId')
  async export(
    @CurrentUser('sub') userId: string,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
    @Query('format') format = 'csv',
    @Query('scope') scope = 'holdings',
    @Res() res: Response,
  ) {
    if (!FORMATS.includes(format as (typeof FORMATS)[number])) {
      throw new BadRequestException(`format must be one of: ${FORMATS.join(', ')}`);
    }
    if (!SCOPES.includes(scope as (typeof SCOPES)[number])) {
      throw new BadRequestException(`scope must be one of: ${SCOPES.join(', ')}`);
    }
    const payload = await this.exportService.export(
      userId,
      portfolioId,
      format as (typeof FORMATS)[number],
      scope as (typeof SCOPES)[number],
    );
    res
      .set({
        'Content-Type': payload.contentType,
        'Content-Disposition': `attachment; filename="${payload.filename}"`,
        'Content-Length': payload.buffer.length,
      })
      .send(payload.buffer);
  }
}
