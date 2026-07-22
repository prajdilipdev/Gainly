import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Exchange, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';

@Injectable()
export class WatchlistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataService,
  ) {}

  async findAll(userId: string) {
    return this.prisma.watchlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { items: true } } },
    });
  }

  async findOne(userId: string, id: string, withQuotes = true) {
    const watchlist = await this.prisma.watchlist.findUnique({
      where: { id },
      include: { items: { orderBy: { addedAt: 'asc' } } },
    });
    if (!watchlist) throw new NotFoundException('Watchlist not found');
    if (watchlist.userId !== userId) {
      throw new ForbiddenException('You do not own this watchlist');
    }
    if (!withQuotes || watchlist.items.length === 0) return watchlist;

    const quotes = await this.marketData.getQuotes(
      watchlist.items.map((i) => ({ symbol: i.symbol, exchange: i.exchange })),
    );
    const quoteMap = new Map(quotes.map((q) => [`${q.symbol}:${q.exchange}`, q]));
    return {
      ...watchlist,
      items: watchlist.items.map((i) => ({
        ...i,
        quote: quoteMap.get(`${i.symbol}:${i.exchange}`) ?? null,
      })),
    };
  }

  async create(userId: string, name: string) {
    try {
      return await this.prisma.watchlist.create({
        data: { userId, name: name.trim() },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(`A watchlist named "${name}" already exists`);
      }
      throw err;
    }
  }

  async rename(userId: string, id: string, name: string) {
    await this.assertOwnership(userId, id);
    return this.prisma.watchlist.update({
      where: { id },
      data: { name: name.trim() },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwnership(userId, id);
    await this.prisma.watchlist.delete({ where: { id } });
    return { deleted: true };
  }

  async addItem(
    userId: string,
    watchlistId: string,
    item: { symbol: string; exchange: Exchange; companyName?: string },
  ) {
    await this.assertOwnership(userId, watchlistId);
    try {
      return await this.prisma.watchlistItem.create({
        data: {
          watchlistId,
          symbol: item.symbol.toUpperCase().trim(),
          exchange: item.exchange,
          companyName: item.companyName?.trim(),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `${item.symbol} is already on this watchlist`,
        );
      }
      throw err;
    }
  }

  async removeItem(userId: string, watchlistId: string, itemId: string) {
    await this.assertOwnership(userId, watchlistId);
    const deleted = await this.prisma.watchlistItem.deleteMany({
      where: { id: itemId, watchlistId },
    });
    if (deleted.count === 0) throw new NotFoundException('Item not found');
    return { deleted: true };
  }

  private async assertOwnership(userId: string, id: string) {
    const watchlist = await this.prisma.watchlist.findUnique({ where: { id } });
    if (!watchlist) throw new NotFoundException('Watchlist not found');
    if (watchlist.userId !== userId) {
      throw new ForbiddenException('You do not own this watchlist');
    }
  }
}
