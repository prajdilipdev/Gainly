import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsString,
  MaxLength,
} from 'class-validator';
import { ImportService } from './import.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FieldKey } from './column-mapper';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

class PreviewTextDto {
  @IsString()
  @MaxLength(5_000_000)
  text!: string;
}

class RemapDto {
  @IsArray()
  @ArrayMaxSize(10_001)
  table!: string[][];

  @IsObject()
  mapping!: Record<string, FieldKey | null>;

  @IsBoolean()
  hasHeader!: boolean;
}

class CommitDto {
  @IsArray()
  @ArrayMaxSize(10_000)
  rows!: {
    symbol: string;
    exchange: string;
    type: string;
    quantity: number;
    price: number;
    fees?: number;
    currency?: string;
    companyName?: string;
    notes?: string;
    date: string;
  }[];
}

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  // Parsing multi-MB spreadsheets is CPU/memory heavy — throttle tighter
  // than the global limit.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('preview/file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  previewFile(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded (field: "file")');
    return this.importService.previewFile(file.buffer, file.originalname);
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('preview/text')
  previewText(@Body() dto: PreviewTextDto) {
    return this.importService.previewText(dto.text);
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('remap')
  remap(@Body() dto: RemapDto) {
    return this.importService.remap(dto.table, dto.mapping, dto.hasHeader);
  }

  @Post('portfolios/:portfolioId/commit')
  commit(
    @CurrentUser('sub') userId: string,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
    @Body() dto: CommitDto,
  ) {
    return this.importService.commit(userId, portfolioId, dto.rows);
  }
}
