import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Currency } from '@prisma/client';

export class CreatePortfolioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(Currency)
  baseCurrency?: Currency;
}

export class UpdatePortfolioDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(Currency)
  baseCurrency?: Currency;
}
