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
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AlertCondition, AlertStatus, Exchange } from '@prisma/client';
import { AlertsService } from './alerts.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class CreateAlertDto {
  @IsString()
  @Matches(/^[A-Za-z0-9.\-&]{1,20}$/)
  symbol!: string;

  @IsEnum(Exchange)
  exchange!: Exchange;

  @IsEnum(AlertCondition)
  condition!: AlertCondition;

  @IsNumber()
  @Min(0.000001)
  @Max(100_000_000_000)
  threshold!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

class UpdateAlertStatusDto {
  // TRIGGERED is set exclusively by the scheduler; clients may only arm/disarm
  @IsEnum(AlertStatus)
  @IsIn(['ACTIVE', 'DISABLED'], {
    message: 'status must be ACTIVE or DISABLED',
  })
  status!: AlertStatus;
}

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll(@CurrentUser('sub') userId: string) {
    return this.alertsService.findAll(userId);
  }

  @Post()
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateAlertDto) {
    return this.alertsService.create(userId, dto);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertStatusDto,
  ) {
    return this.alertsService.setStatus(userId, id, dto.status);
  }

  @Delete(':id')
  remove(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertsService.remove(userId, id);
  }
}
