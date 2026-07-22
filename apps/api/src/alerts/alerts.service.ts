import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertCondition, AlertStatus, Exchange, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAlertInput {
  symbol: string;
  exchange: Exchange;
  condition: AlertCondition;
  threshold: number;
  note?: string;
}

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.alert.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, input: CreateAlertInput) {
    return this.prisma.alert.create({
      data: {
        userId,
        symbol: input.symbol.toUpperCase().trim(),
        exchange: input.exchange,
        condition: input.condition,
        threshold: new Prisma.Decimal(input.threshold),
        note: input.note?.trim(),
      },
    });
  }

  async setStatus(userId: string, id: string, status: AlertStatus) {
    await this.assertOwnership(userId, id);
    return this.prisma.alert.update({
      where: { id },
      data: {
        status,
        ...(status === 'ACTIVE' && { triggeredAt: null }),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwnership(userId, id);
    await this.prisma.alert.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertOwnership(userId: string, id: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.userId !== userId) {
      throw new ForbiddenException('You do not own this alert');
    }
  }
}
