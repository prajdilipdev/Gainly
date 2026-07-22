import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortfolioDto, UpdatePortfolioDto } from './dto/portfolio.dto';

@Injectable()
export class PortfoliosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.portfolio.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { transactions: true } } },
    });
  }

  async findOne(userId: string, id: string) {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id },
      include: { _count: { select: { transactions: true } } },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');
    if (portfolio.userId !== userId) {
      throw new ForbiddenException('You do not own this portfolio');
    }
    return portfolio;
  }

  async create(userId: string, dto: CreatePortfolioDto) {
    try {
      return await this.prisma.portfolio.create({
        data: {
          userId,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          baseCurrency: dto.baseCurrency ?? 'USD',
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `A portfolio named "${dto.name}" already exists`,
        );
      }
      throw err;
    }
  }

  async update(userId: string, id: string, dto: UpdatePortfolioDto) {
    await this.findOne(userId, id);
    try {
      return await this.prisma.portfolio.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description: dto.description?.trim(),
          baseCurrency: dto.baseCurrency,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `A portfolio named "${dto.name}" already exists`,
        );
      }
      throw err;
    }
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.portfolio.delete({ where: { id } });
    return { deleted: true };
  }
}
