import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PortfoliosService } from './portfolios.service';
import { CreatePortfolioDto, UpdatePortfolioDto } from './dto/portfolio.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('portfolios')
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Get()
  findAll(@CurrentUser('sub') userId: string) {
    return this.portfoliosService.findAll(userId);
  }

  // Accepts either the UUID or the readable slug so /portfolios/my-stocks
  // works alongside old /portfolios/<uuid> bookmarks.
  @Get(':idOrSlug')
  findOne(
    @CurrentUser('sub') userId: string,
    @Param('idOrSlug') idOrSlug: string,
  ) {
    return this.portfoliosService.findOne(userId, idOrSlug);
  }

  @Post()
  create(@CurrentUser('sub') userId: string, @Body() dto: CreatePortfolioDto) {
    return this.portfoliosService.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.portfoliosService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portfoliosService.remove(userId, id);
  }
}
