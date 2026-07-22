import { plainToInstance, Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

class EnvVariables {
  @Expose()
  @IsString()
  DATABASE_URL!: string;

  @Expose()
  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET!: string;

  @Expose()
  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET!: string;

  @Expose()
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @Expose()
  @IsOptional()
  @IsInt()
  PORT?: number;

  @Expose()
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @Expose()
  @IsOptional()
  @IsString()
  COOKIE_SECRET?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvVariables, config, {
    enableImplicitConversion: true,
    excludeExtraneousValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }
  return { ...config, ...validated };
}
