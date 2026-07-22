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
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Exchange } from '@prisma/client';
import { WatchlistsService } from './watchlists.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class WatchlistNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

class AddItemDto {
  @IsString()
  @Matches(/^[A-Za-z0-9.\-&]{1,20}$/)
  symbol!: string;

  @IsEnum(Exchange)
  exchange!: Exchange;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;
}

@Controller('watchlists')
export class WatchlistsController {
  constructor(private readonly watchlistsService: WatchlistsService) {}

  @Get()
  findAll(@CurrentUser('sub') userId: string) {
    return this.watchlistsService.findAll(userId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.watchlistsService.findOne(userId, id);
  }

  @Post()
  create(@CurrentUser('sub') userId: string, @Body() dto: WatchlistNameDto) {
    return this.watchlistsService.create(userId, dto.name);
  }

  @Patch(':id')
  rename(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WatchlistNameDto,
  ) {
    return this.watchlistsService.rename(userId, id, dto.name);
  }

  @Delete(':id')
  remove(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.watchlistsService.remove(userId, id);
  }

  @Post(':id/items')
  addItem(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddItemDto,
  ) {
    return this.watchlistsService.addItem(userId, id, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.watchlistsService.removeItem(userId, id, itemId);
  }
}
