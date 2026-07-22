import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Currency, Exchange, TransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type!: TransactionType;

  @IsString()
  @Matches(/^[A-Za-z0-9.\-&]{1,20}$/, {
    message: 'Symbol must be 1-20 characters (letters, digits, ".", "-", "&")',
  })
  symbol!: string;

  @IsEnum(Exchange)
  exchange!: Exchange;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsNumber()
  @Min(0.000001)
  @Max(1_000_000_000)
  quantity!: number;

  /**
   * Per-share price for BUY/SELL, total cash amount for DIVIDEND,
   * and the split multiplier for SPLIT (e.g. 2 for a 2-for-1 split).
   */
  @IsNumber()
  @Min(0)
  @Max(100_000_000_000)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  fees?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsDateString()
  executedAt!: string;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9.\-&]{1,20}$/)
  symbol?: string;

  @IsOptional()
  @IsEnum(Exchange)
  exchange?: Exchange;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  @Max(1_000_000_000)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000_000_000)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  fees?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsDateString()
  executedAt?: string;
}

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsEnum(Exchange)
  exchange?: Exchange;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number;
}
