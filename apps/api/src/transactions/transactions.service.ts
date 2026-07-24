import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfoliosService } from '../portfolios/portfolios.service';
import { currencyForExchange } from '../market-data/symbol.util';
import {
  CreateTransactionDto,
  ListTransactionsQueryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfoliosService: PortfoliosService,
  ) {}

  async list(
    userId: string,
    portfolioId: string,
    query: ListTransactionsQueryDto,
  ) {
    await this.portfoliosService.findOne(userId, portfolioId);
    const where: Prisma.TransactionWhereInput = {
      portfolioId,
      ...(query.symbol && { symbol: query.symbol.toUpperCase() }),
      ...(query.type && { type: query.type }),
      ...(query.exchange && { exchange: query.exchange }),
      ...((query.from || query.to) && {
        executedAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: [{ executedAt: 'desc' }, { createdAt: 'desc' }],
        take: query.limit ?? 100,
        skip: query.offset ?? 0,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { items, total };
  }

  async create(userId: string, portfolioId: string, dto: CreateTransactionDto) {
    await this.portfoliosService.findOne(userId, portfolioId);
    this.validateBusinessRules(dto);

    const symbol = dto.symbol.toUpperCase().trim();
    if (dto.type === 'SELL') {
      await this.assertSufficientQuantity(
        portfolioId,
        symbol,
        dto.exchange,
        dto.quantity,
        new Date(dto.executedAt),
        null,
      );
    }

    return this.prisma.transaction.create({
      data: {
        portfolioId,
        type: dto.type,
        symbol,
        exchange: dto.exchange,
        companyName: dto.companyName?.trim(),
        quantity: new Prisma.Decimal(dto.quantity),
        price: new Prisma.Decimal(dto.price),
        fees: new Prisma.Decimal(dto.fees ?? 0),
        // Currency is fully determined by the exchange (NSE/BSE → INR,
        // NYSE/NASDAQ → USD); never let a stray value contradict it.
        currency: currencyForExchange(dto.exchange),
        notes: dto.notes?.trim(),
        executedAt: new Date(dto.executedAt),
      },
    });
  }

  async update(
    userId: string,
    portfolioId: string,
    transactionId: string,
    dto: UpdateTransactionDto,
  ) {
    await this.portfoliosService.findOne(userId, portfolioId);
    const existing = await this.prisma.transaction.findFirst({
      where: { id: transactionId, portfolioId },
    });
    if (!existing) throw new BadRequestException('Transaction not found');

    const merged = {
      type: dto.type ?? existing.type,
      symbol: (dto.symbol ?? existing.symbol).toUpperCase().trim(),
      exchange: dto.exchange ?? existing.exchange,
      quantity: dto.quantity ?? existing.quantity.toNumber(),
      price: dto.price ?? existing.price.toNumber(),
      executedAt: dto.executedAt ?? existing.executedAt.toISOString(),
    };
    this.validateBusinessRules(merged as CreateTransactionDto);

    if (merged.type === 'SELL') {
      await this.assertSufficientQuantity(
        portfolioId,
        merged.symbol,
        merged.exchange,
        merged.quantity,
        new Date(merged.executedAt),
        transactionId,
      );
    }

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        type: dto.type,
        symbol: dto.symbol?.toUpperCase().trim(),
        exchange: dto.exchange,
        companyName: dto.companyName?.trim(),
        quantity:
          dto.quantity !== undefined
            ? new Prisma.Decimal(dto.quantity)
            : undefined,
        price:
          dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        fees: dto.fees !== undefined ? new Prisma.Decimal(dto.fees) : undefined,
        // Keep currency in lockstep with the (possibly changed) exchange, so
        // correcting a stock's exchange also fixes a wrong currency.
        currency: currencyForExchange(merged.exchange),
        notes: dto.notes?.trim(),
        executedAt: dto.executedAt ? new Date(dto.executedAt) : undefined,
      },
    });
  }

  async remove(userId: string, portfolioId: string, transactionId: string) {
    await this.portfoliosService.findOne(userId, portfolioId);
    const deleted = await this.prisma.transaction.deleteMany({
      where: { id: transactionId, portfolioId },
    });
    if (deleted.count === 0) {
      throw new BadRequestException('Transaction not found');
    }
    return { deleted: true };
  }

  private validateBusinessRules(dto: {
    type: TransactionType;
    price: number;
    quantity: number;
    executedAt: string;
  }) {
    // Small tolerance for client/server clock skew and network latency when
    // a client submits a transaction dated "right now".
    const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
    if (new Date(dto.executedAt).getTime() - Date.now() > CLOCK_SKEW_TOLERANCE_MS) {
      throw new BadRequestException('Transaction date cannot be in the future');
    }
    if ((dto.type === 'BUY' || dto.type === 'SELL') && dto.price <= 0) {
      throw new BadRequestException('Price must be positive for BUY/SELL');
    }
    if (dto.type === 'SPLIT' && dto.price <= 0) {
      throw new BadRequestException(
        'Split ratio (price field) must be positive, e.g. 2 for a 2-for-1 split',
      );
    }
  }

  /**
   * Ensures a SELL does not exceed the split-adjusted quantity held at the
   * sell date. `excludeId` skips the transaction being edited.
   */
  private async assertSufficientQuantity(
    portfolioId: string,
    symbol: string,
    exchange: CreateTransactionDto['exchange'],
    sellQty: number,
    at: Date,
    excludeId: string | null,
  ) {
    const txs = await this.prisma.transaction.findMany({
      where: {
        portfolioId,
        symbol,
        exchange,
        executedAt: { lte: at },
        ...(excludeId && { id: { not: excludeId } }),
      },
      orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }],
    });
    let qty = 0;
    for (const tx of txs) {
      if (tx.type === 'BUY') qty += tx.quantity.toNumber();
      else if (tx.type === 'SELL') qty -= tx.quantity.toNumber();
      else if (tx.type === 'SPLIT') qty *= tx.price.toNumber();
    }
    // Small epsilon for floating point accumulation
    if (sellQty > qty + 1e-9) {
      throw new BadRequestException(
        `Cannot sell ${sellQty} shares of ${symbol}: only ${qty.toFixed(6)} held on ${at.toISOString().slice(0, 10)}`,
      );
    }
  }
}
