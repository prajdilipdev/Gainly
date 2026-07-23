import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortfolioDto, UpdatePortfolioDto } from './dto/portfolio.dto';

// Matches a v4-style UUID, used to tell an id apart from a slug in the URL.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turns a portfolio name into a URL-safe slug (empty names fall back). */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accent marks
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric -> hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .slice(0, 60);
  return base || 'portfolio';
}

@Injectable()
export class PortfoliosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const portfolios = await this.prisma.portfolio.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { transactions: true } } },
    });
    // Backfill slugs for rows created before slugs existed, so every
    // portfolio has a readable URL from here on.
    const missing = portfolios.filter((p) => !p.slug);
    if (missing.length) {
      const taken = new Set(
        portfolios.map((p) => p.slug).filter((s): s is string => !!s),
      );
      for (const p of missing) {
        const slug = this.dedupeSlug(slugify(p.name), taken);
        taken.add(slug);
        await this.prisma.portfolio.update({ where: { id: p.id }, data: { slug } });
        p.slug = slug;
      }
    }
    return portfolios;
  }

  /** Look up a portfolio by its UUID or its per-user slug. */
  async findOne(userId: string, idOrSlug: string) {
    const where: Prisma.PortfolioWhereInput = UUID_RE.test(idOrSlug)
      ? { id: idOrSlug }
      : { userId, slug: idOrSlug };
    const portfolio = await this.prisma.portfolio.findFirst({
      where,
      include: { _count: { select: { transactions: true } } },
    });
    if (!portfolio) throw new NotFoundException('Portfolio not found');
    if (portfolio.userId !== userId) {
      throw new ForbiddenException('You do not own this portfolio');
    }
    // A pre-slug portfolio opened via its UUID: mint a slug now.
    if (!portfolio.slug) {
      portfolio.slug = await this.assignSlug(userId, portfolio.name, portfolio.id);
    }
    return portfolio;
  }

  async create(userId: string, dto: CreatePortfolioDto) {
    const name = dto.name.trim();
    try {
      return await this.prisma.portfolio.create({
        data: {
          userId,
          name,
          slug: await this.uniqueSlug(userId, name),
          description: dto.description?.trim(),
          baseCurrency: dto.baseCurrency ?? 'USD',
        },
      });
    } catch (err) {
      throw this.mapConflict(err, dto.name);
    }
  }

  async update(userId: string, id: string, dto: UpdatePortfolioDto) {
    await this.findOne(userId, id);
    const name = dto.name?.trim();
    try {
      return await this.prisma.portfolio.update({
        where: { id },
        data: {
          name,
          // Keep the URL in step with the name when it changes.
          ...(name ? { slug: await this.uniqueSlug(userId, name, id) } : {}),
          description: dto.description?.trim(),
          baseCurrency: dto.baseCurrency,
        },
      });
    } catch (err) {
      throw this.mapConflict(err, dto.name ?? '');
    }
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.portfolio.delete({ where: { id } });
    return { deleted: true };
  }

  /** Generates a slug unique among the user's other portfolios. */
  private async uniqueSlug(
    userId: string,
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const others = await this.prisma.portfolio.findMany({
      where: { userId, id: excludeId ? { not: excludeId } : undefined },
      select: { slug: true },
    });
    const taken = new Set(
      others.map((o) => o.slug).filter((s): s is string => !!s),
    );
    return this.dedupeSlug(slugify(name), taken);
  }

  /** Persists a freshly generated slug onto an existing portfolio row. */
  private async assignSlug(userId: string, name: string, id: string) {
    const slug = await this.uniqueSlug(userId, name, id);
    await this.prisma.portfolio.update({ where: { id }, data: { slug } });
    return slug;
  }

  /** Appends -2, -3, … until the slug is not already in `taken`. */
  private dedupeSlug(base: string, taken: Set<string>): string {
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private mapConflict(err: unknown, name: string): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException(`A portfolio named "${name}" already exists`);
    }
    return err;
  }
}
