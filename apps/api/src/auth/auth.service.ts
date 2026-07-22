import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { JwtPayload } from '../common/guards/jwt-auth.guard';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 7;
const BCRYPT_ROUNDS = 12;

// Per-account lockout, layered on top of the IP-based ThrottlerGuard. The IP
// throttle stops volumetric brute force from one source but (a) can collide
// innocent users behind a shared IP/NAT and (b) does nothing against
// credential stuffing that spreads attempts for one victim across many IPs.
// This closes gap (b) without loosening the IP throttle.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_WINDOW_SECONDS = 5 * 60;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  baseCurrency: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: SafeUser } & AuthTokens> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: dto.name.trim(),
        baseCurrency: dto.baseCurrency ?? 'USD',
      },
    });
    const tokens = await this.issueTokens(user.id, user.email);
    return { user: this.toSafeUser(user), ...tokens };
  }

  async login(dto: LoginDto): Promise<{ user: SafeUser } & AuthTokens> {
    const email = dto.email.toLowerCase().trim();
    const lockoutKey = `auth:failed-login:${email}`;

    const failedAttempts = (await this.cache.get<number>(lockoutKey)) ?? 0;
    if (failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      throw new HttpException(
        'Too many failed login attempts for this account. Please try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    // Constant-time-ish behavior: always run a hash comparison
    const hash =
      user?.passwordHash ??
      '$2a$12$invalidsaltinvalidsaltinvalidsaltinvalidsaltinvali';
    const valid = await bcrypt.compare(dto.password, hash);
    if (!user || !valid) {
      await this.cache.set(
        lockoutKey,
        failedAttempts + 1,
        LOGIN_LOCKOUT_WINDOW_SECONDS,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.cache.del(lockoutKey);
    const tokens = await this.issueTokens(user.id, user.email);
    return { user: this.toSafeUser(user), ...tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // Possible token reuse — revoke the whole family for safety
      if (stored?.revokedAt) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    // Rotate: revoke the used token, issue a new pair
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(payload.sub, payload.email);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string, email: string): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email, type: 'access' },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL,
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, email, type: 'refresh', jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d`,
      },
    );
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.prisma.refreshToken.create({
      data: { tokenHash: this.hashToken(refreshToken), userId, expiresAt },
    });
    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toSafeUser(user: {
    id: string;
    email: string;
    name: string;
    baseCurrency: string;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      baseCurrency: user.baseCurrency,
    };
  }
}
