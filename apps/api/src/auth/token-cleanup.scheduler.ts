import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Revoked tokens are kept briefly so reuse detection still has something to match. */
const REVOKED_RETENTION_DAYS = 30;

/**
 * Refresh tokens are written on every login and every rotation, so without a
 * sweep the table grows without bound for the life of the deployment.
 */
@Injectable()
export class TokenCleanupScheduler {
  private readonly logger = new Logger(TokenCleanupScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeStaleRefreshTokens() {
    const revokedCutoff = new Date(
      Date.now() - REVOKED_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    try {
      const { count } = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { revokedAt: { lt: revokedCutoff } },
          ],
        },
      });
      if (count > 0) {
        this.logger.log(`Purged ${count} expired/revoked refresh token(s)`);
      }
    } catch (err) {
      this.logger.warn(
        `Refresh token cleanup failed: ${(err as Error).message}`,
      );
    }
  }
}
