import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenCleanupScheduler } from './token-cleanup.scheduler';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenCleanupScheduler],
  exports: [JwtModule],
})
export class AuthModule {}
